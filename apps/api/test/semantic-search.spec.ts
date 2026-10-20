import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SemanticService } from '../src/semantic/semantic.service';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';
import { FakeEmbeddings, fakeVector } from './support/fake-embeddings';

describe('fakeVector', () => {
  const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);

  it('puts words with the same meaning close together', () => {
    expect(cosine(fakeVector('carro lento'), fakeVector('automóvel devagar'))).toBeCloseTo(1, 5);
    expect(cosine(fakeVector('carro lento'), fakeVector('relatório de vendas'))).toBeLessThan(0.3);
  });
});

describe('Semantic search', () => {
  const embeddings = new FakeEmbeddings();
  let sim: TestApp;
  let semantic: SemanticService;
  let admin: Browser;
  let ana: Browser;
  let ti: string;
  let field: string;
  let required: Record<string, string>;
  const number: Record<string, number> = {};

  const publish = async (title: string, text: string) =>
    (
      await ana
        .post('/api/ideas')
        .send({ title, categoryId: ti, values: { ...required, [field]: text }, publish: true })
        .expect(201)
    ).body.number as number;
  const similar = async (title: string, text = '') =>
    (
      (await ana.get('/api/ideas/similar').query({ title, text }).expect(200)).body as {
        title: string;
      }[]
    ).map((idea) => idea.title);

  beforeAll(async () => {
    sim = await createApp(
      {
        SIM_EMBEDDINGS_URL: 'http://embeddings.test/v1',
        SIM_EMBEDDINGS_MODEL: 'fake-1',
        REDIS_URL: inject('redisUrl'),
        SIM_MODE: 'api', // indexing is called directly here
        SIM_SEMANTIC_THRESHOLD: '0.5',
      },
      { embeddings },
    );
    semantic = sim.app.get(SemanticService);
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'Geral' }).expect(201)).body.id;
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      label: string;
      required: boolean;
    }[];
    field = fields.find((f) => f.label === 'Situação atual')!.id;
    required = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));

    number.parking = await publish('Garagem para carros', 'Faltam lugares');
    number.coffee = await publish('Cafeteira nova', 'cafe');
    number.report = await publish('Relatório de vendas', 'Gerar mensalmente');
    await ana.post('/api/ideas').send({ title: 'Rascunho de carro', categoryId: ti }).expect(201);
  });

  afterAll(() => sim.close());

  it('has nothing to find until the Ideas are indexed', async () => {
    expect(await similar('Estacionamento de automóvel')).toEqual([]);
    expect(await semantic.coverage()).toEqual({ total: 3, indexed: 0, pending: 3 });
  });

  it('indexes the pending Ideas (never Drafts) and then finds them by meaning', async () => {
    expect(await semantic.indexPending()).toBe(3);
    expect(await semantic.indexPending()).toBe(0);
    expect(await semantic.coverage()).toEqual({ total: 3, indexed: 3, pending: 0 });

    // No word in common with "Garagem para carros": the text search alone finds nothing.
    expect(await similar('Estacionamento de automóvel')).toEqual(['Garagem para carros']);
    expect(await similar('Máquina de café')).not.toContain('Garagem para carros'); // other concepts
  });

  it('keeps the text matches and adds the ones found only by meaning', async () => {
    const found = await similar('Garagem para carros novos');
    expect(found[0]).toBe('Garagem para carros');
    expect(new Set(found).size).toBe(found.length); // no duplicates
  });

  it('re-indexes an Idea whose text changed', async () => {
    await ana
      .patch(`/api/ideas/${number.report}`)
      .send({ title: 'Cafeteira do escritório', values: { ...required, [field]: 'cafe' } })
      .expect(200);
    expect(await semantic.coverage()).toMatchObject({ pending: 1 });
    expect(await semantic.indexPending()).toBe(1);
    expect(await similar('Café para a copa')).toEqual(
      expect.arrayContaining(['Cafeteira nova', 'Cafeteira do escritório']),
    );
  });

  it('does not suggest the Idea being edited nor Duplicates', async () => {
    const found = (
      await ana
        .get('/api/ideas/similar')
        .query({ title: 'Estacionamento de automóvel', exclude: number.parking })
        .expect(200)
    ).body;
    expect(found).toEqual([]);

    await admin
      .post(`/api/ideas/${number.coffee}/status`)
      .send({ to: 'duplicate', justification: 'Repetida', originalIdeaNumber: number.report })
      .expect(200);
    expect(await similar('Cafeteira')).not.toContain('Cafeteira nova');
  });

  it('falls back to the text result when the embeddings service is down', async () => {
    embeddings.failing = true;
    try {
      expect(await similar('Garagem para carros')).toEqual(['Garagem para carros']);
    } finally {
      embeddings.failing = false;
    }
  });

  it('indexes everything again when the model changes', async () => {
    const other = await createApp(
      {
        SIM_EMBEDDINGS_URL: 'http://embeddings.test/v1',
        SIM_EMBEDDINGS_MODEL: 'fake-2',
        REDIS_URL: inject('redisUrl'),
        SIM_MODE: 'api',
      },
      { embeddings },
    );
    try {
      // A new app has its own empty database; point it to the same one is not needed: the rule is
      // "a vector made by another model does not count", which coverage() reflects.
      expect(await other.app.get(SemanticService).coverage()).toEqual({
        total: 0,
        indexed: 0,
        pending: 0,
      });
    } finally {
      await other.close();
    }
    await sim.pool.query(`update idea_embeddings set model = 'old-model'`);
    expect(await semantic.coverage()).toMatchObject({ indexed: 0 });
    expect(await semantic.indexPending()).toBeGreaterThan(0);
  });

  it('shows the state of the integrations to Administrators only, and tests the connection', async () => {
    await ana.get('/api/integrations').expect(403);
    const { body } = await admin.get('/api/integrations').expect(200);
    expect(body.semanticSearch).toMatchObject({
      configured: true,
      model: 'fake-1',
      threshold: 0.5,
    });
    expect(body.redis.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain('embeddings.test'); // no URLs, no secrets

    const ok = await admin.post('/api/integrations/semantic-search/test').expect(200);
    expect(ok.body).toEqual({ ok: true, dimensions: 64, error: null });
    embeddings.failing = true;
    const down = await admin.post('/api/integrations/semantic-search/test').expect(200);
    embeddings.failing = false;
    expect(down.body).toMatchObject({ ok: false, error: 'embeddings service down' });
  });
});

describe('Semantic search turned off', () => {
  let sim: TestApp;

  beforeAll(async () => {
    sim = await createApp();
  });

  afterAll(() => sim.close());

  it('changes nothing: the text search answers, and the integration says it is off', async () => {
    const admin = await signInAsAdministrator(sim);
    const { body } = await admin.get('/api/integrations').expect(200);
    expect(body.semanticSearch).toMatchObject({ configured: false, model: null, total: 0 });
    expect((await admin.post('/api/integrations/semantic-search/test').expect(200)).body.ok).toBe(
      false,
    );
    await admin.get('/api/ideas/similar').query({ title: 'qualquer coisa' }).expect(200, []);
  });
});
