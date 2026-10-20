import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('Tags', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser;
  let carla: Browser;
  let ti: string;
  let values: Record<string, string>;
  let tag: { custo: string; seguranca: string };

  const tagsOf = async (number: number, who = ana) =>
    ((await who.get(`/api/ideas/${number}`).expect(200)).body.tags as { name: string }[]).map(
      (t) => t.name,
    );

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const reviewer = await createCollaborator(sim, admin, 'Bruno');
    bruno = reviewer.browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [reviewer.id] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(() => sim.close());

  it('only Administrators manage the Tags, with unique names', async () => {
    await ana.post('/api/tags').send({ name: 'Custo' }).expect(403);
    const custo = (await admin.post('/api/tags').send({ name: 'Custo' }).expect(201)).body;
    const seguranca = (await admin.post('/api/tags').send({ name: 'Segurança' }).expect(201)).body;
    tag = { custo: custo.id, seguranca: seguranca.id };

    const taken = await admin.post('/api/tags').send({ name: 'custo' }).expect(409);
    expect(taken.body.code).toBe('TAG_NAME_TAKEN');
    await admin.post('/api/tags').send({ name: '  ' }).expect(400);
    await admin.patch(`/api/tags/${tag.custo}`).send({ name: 'Redução de custo' }).expect(200);

    const { body } = await ana.get('/api/tags').expect(200);
    expect(body.map((t: { name: string }) => t.name)).toEqual(['Redução de custo', 'Segurança']);
  });

  it('the Author tags on creation and while the Idea is Open; then the Reviewers do', async () => {
    const { body } = await ana
      .post('/api/ideas')
      .send({ title: 'Senhas', categoryId: ti, values, publish: true, tagIds: [tag.seguranca] })
      .expect(201);
    expect(body.tags).toEqual([{ id: tag.seguranca, name: 'Segurança' }]);
    expect(body.permissions.canTag).toBe(true);
    const number = body.number as number;

    await ana
      .put(`/api/ideas/${number}/tags`)
      .send({ tagIds: [tag.custo, tag.seguranca] })
      .expect(200);
    expect(await tagsOf(number)).toEqual(['Redução de custo', 'Segurança']);

    const colleague = await carla.put(`/api/ideas/${number}/tags`).send({ tagIds: [] }).expect(403);
    expect(colleague.body.code).toBe('FORBIDDEN');

    await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'under_review', justification: 'Vamos ver' })
      .expect(200);
    const locked = await ana.put(`/api/ideas/${number}/tags`).send({ tagIds: [] }).expect(409);
    expect(locked.body.code).toBe('EDIT_LOCKED');
    expect((await ana.get(`/api/ideas/${number}`)).body.permissions.canTag).toBe(false);

    await bruno
      .put(`/api/ideas/${number}/tags`)
      .send({ tagIds: [tag.custo] })
      .expect(200);
    expect(await tagsOf(number)).toEqual(['Redução de custo']);

    const unknown = await bruno
      .put(`/api/ideas/${number}/tags`)
      .send({ tagIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);
    expect(unknown.body.code).toBe('UNKNOWN_TAG');
  });

  it('filters the list by Tag and shows the Tags of each Idea', async () => {
    await ana
      .post('/api/ideas')
      .send({ title: 'Sem etiqueta', categoryId: ti, values, publish: true })
      .expect(201);
    const { body } = await carla.get('/api/ideas').query({ tagId: tag.custo }).expect(200);
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(['Senhas']);
    expect(body.items[0].tags).toEqual([{ id: tag.custo, name: 'Redução de custo' }]);
  });

  it('deleting a Tag takes it off the Ideas', async () => {
    await ana.delete(`/api/tags/${tag.custo}`).expect(403);
    await admin.delete(`/api/tags/${tag.custo}`).expect(204);
    const { body } = await carla.get('/api/ideas').expect(200);
    expect(body.items.flatMap((i: { tags: unknown[] }) => i.tags)).toEqual([]);
    await admin.delete(`/api/tags/${tag.custo}`).expect(404);
  });
});
