import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { transitionsFrom } from '../src/ideas/domain/idea';
import { renderEmail } from '../src/notifications/email/email-templates';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('transitionsFrom', () => {
  it('follows the normal flow when nothing is turned off', () => {
    expect(transitionsFrom('under_review')).toEqual([
      'approved',
      'declined',
      'duplicate',
      'archived',
    ]);
    expect(transitionsFrom('approved')).toEqual(['in_progress', 'declined']);
  });

  it('skips a Status that is turned off, going to where it would lead', () => {
    expect(transitionsFrom('under_review', ['approved'])).toEqual([
      'in_progress',
      'declined',
      'duplicate',
      'archived',
    ]);
    expect(transitionsFrom('under_review', ['approved', 'in_progress'])).toEqual([
      'done',
      'declined',
      'duplicate',
      'archived',
    ]);
  });

  it('still lets an Idea leave a Status that was turned off', () => {
    expect(transitionsFrom('approved', ['approved', 'in_progress'])).toEqual(['done', 'declined']);
  });
});

describe('e-mail with Status names', () => {
  it('uses the names the Administrator gave', () => {
    const email = renderEmail({
      locale: 'pt-BR',
      type: 'status',
      recipientName: 'Ana',
      actorName: 'Bruno',
      ideaNumber: 3,
      ideaTitle: 'Ideia',
      data: { from: 'open', to: 'under_review' },
      url: 'http://localhost/ideas/3',
      statusLabels: { under_review: 'Na fila do comitê' },
    });
    expect(email.subject).toContain('de Aberta para Na fila do comitê');
  });
});

describe('Status settings', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser;
  let ti: string;
  let values: Record<string, string>;

  const newIdea = async () =>
    (
      await ana
        .post('/api/ideas')
        .send({ title: 'Ideia', categoryId: ti, values, publish: true })
        .expect(201)
    ).body.number as number;
  const transitions = async (number: number) =>
    (await bruno.get(`/api/ideas/${number}`).expect(200)).body.permissions.transitions;

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const reviewer = await createCollaborator(sim, admin, 'Bruno');
    bruno = reviewer.browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [reviewer.id] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(() => sim.close());

  it('lists every Status with its defaults, to any signed-in person', async () => {
    const { body } = await ana.get('/api/statuses').expect(200);
    expect(body).toHaveLength(9);
    expect(body.find((s: { status: string }) => s.status === 'approved')).toEqual({
      status: 'approved',
      label: null,
      color: null,
      description: '',
      enabled: true,
      optional: true,
    });
    await sim.http().get('/api/statuses').expect(401);
  });

  it('only Administrators customize', async () => {
    await ana.put('/api/statuses/open').send({ label: 'Nova' }).expect(403);
  });

  it('renames, recolors and describes a Status, and resets it', async () => {
    const { body } = await admin
      .put('/api/statuses/under_review')
      .send({ label: 'No comitê', color: '#aa5500', description: 'Aguardando o comitê.' })
      .expect(200);
    expect(body).toMatchObject({ label: 'No comitê', color: '#aa5500', enabled: true });

    const reset = await admin
      .put('/api/statuses/under_review')
      .send({ label: null, color: null, description: '' })
      .expect(200);
    expect(reset).toMatchObject({ body: { label: null, color: null } });

    await admin.put('/api/statuses/under_review').send({ color: 'laranja' }).expect(400);
    await admin.put('/api/statuses/under_review').send({ label: '  ' }).expect(400);
    await admin.put('/api/statuses/inexistente').send({ label: 'X' }).expect(400);
  });

  it('only the optional Statuses can be turned off', async () => {
    const refused = await admin.put('/api/statuses/open').send({ enabled: false }).expect(400);
    expect(refused.body.code).toBe('STATUS_NOT_OPTIONAL');
    await admin.put('/api/statuses/done').send({ enabled: false }).expect(400);
  });

  it('a Status turned off disappears from the choices and cannot be chosen', async () => {
    const number = await newIdea();
    await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'under_review', justification: 'Vamos ver' })
      .expect(200);
    expect(await transitions(number)).toContain('approved');

    await admin.put('/api/statuses/approved').send({ enabled: false }).expect(200);
    expect(await transitions(number)).toEqual(['in_progress', 'declined', 'duplicate', 'archived']);
    const refused = await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'approved', justification: 'Aprovando' })
      .expect(409);
    expect(refused.body.code).toBe('INVALID_TRANSITION');
    await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'in_progress', justification: 'Direto' })
      .expect(200);

    await admin.put('/api/statuses/approved').send({ enabled: true }).expect(200);
    expect(await transitions(await newIdea())).not.toContain('approved'); // Open → Under review first
  });
});
