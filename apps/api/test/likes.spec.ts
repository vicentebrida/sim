import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('Likes', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser; // Author
  let bruno: Browser;
  let carla: Browser;
  let davi: Browser;
  let ti: string;
  let values: Record<string, string>;

  async function newIdea(who: Browser, data: Record<string, unknown> = {}) {
    const response = await who
      .post('/api/ideas')
      .send({ title: 'Café na copa do 3º andar', categoryId: ti, values, publish: true, ...data })
      .expect(201);
    return response.body.number as number;
  }

  const changeStatus = (number: number, to: string, extra: Record<string, unknown> = {}) =>
    admin
      .post(`/api/ideas/${number}/status`)
      .send({ to, justification: 'Committee decision', ...extra })
      .expect(200);

  const names = (body: { collaborator: { name: string } }[]) =>
    body.map((like) => like.collaborator.name);

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    bruno = (await createCollaborator(sim, admin, 'Bruno')).browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;
    davi = (await createCollaborator(sim, admin, 'Davi')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;

    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(
      fields.filter((f) => f.required).map((f) => [f.id, 'Example text']),
    );
  });

  afterAll(() => sim.close());

  it('a colleague likes once, takes it back, and everyone sees who liked', async () => {
    const number = await newIdea(ana);

    const like = await bruno.put(`/api/ideas/${number}/like`).expect(200);
    expect(like.body).toEqual({ total: 1, liked: true });
    // Liking again does not count twice.
    await bruno.put(`/api/ideas/${number}/like`).expect(200, { total: 1, liked: true });
    await carla.put(`/api/ideas/${number}/like`).expect(200, { total: 2, liked: true });

    const detail = await ana.get(`/api/ideas/${number}`).expect(200);
    expect(detail.body.likes).toEqual({ total: 2, liked: false });
    expect(detail.body.permissions.canLike).toBe(false);

    const who = await davi.get(`/api/ideas/${number}/likes`).expect(200);
    expect(names(who.body)).toEqual(['Carla', 'Bruno']);

    await carla.delete(`/api/ideas/${number}/like`).expect(200, { total: 1, liked: false });
    const list = await bruno.get('/api/ideas').expect(200);
    expect(list.body.items.find((i: { number: number }) => i.number === number).likes).toEqual({
      total: 1,
      liked: true,
    });
  });

  it('the Author does not like her own Idea', async () => {
    const number = await newIdea(ana);
    const { body } = await ana.put(`/api/ideas/${number}/like`).expect(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('Likes are frozen outside the in-progress Statuses', async () => {
    const number = await newIdea(ana);
    await bruno.put(`/api/ideas/${number}/like`).expect(200);
    await changeStatus(number, 'archived');

    const like = await carla.put(`/api/ideas/${number}/like`).expect(409);
    expect(like.body.code).toBe('LIKE_UNAVAILABLE');
    // Nor can it be taken back: the recorded support stays as it was.
    await bruno.delete(`/api/ideas/${number}/like`).expect(409);
    expect((await bruno.get(`/api/ideas/${number}`).expect(200)).body.likes.total).toBe(1);
  });

  it('a Draft cannot be liked nor have its Likes listed by others', async () => {
    const { body } = await ana
      .post('/api/ideas')
      .send({ title: 'Rascunho', categoryId: ti })
      .expect(201);
    await bruno.put(`/api/ideas/${body.number}/like`).expect(404);
    await bruno.get(`/api/ideas/${body.number}/likes`).expect(404);
  });

  it('a Like from someone else keeps the Author from deleting the Open Idea', async () => {
    const number = await newIdea(ana);
    await bruno.put(`/api/ideas/${number}/like`).expect(200);

    const detail = await ana.get(`/api/ideas/${number}`).expect(200);
    expect(detail.body.permissions.canDelete).toBe(false);
    await ana.delete(`/api/ideas/${number}`).expect(409);

    await bruno.delete(`/api/ideas/${number}/like`).expect(200);
    await ana.delete(`/api/ideas/${number}`).expect(204);
  });

  it('a Duplicate takes its Likes to the original Idea, without counting twice', async () => {
    const original = await newIdea(bruno, { title: 'Máquina de café nova' });
    const duplicate = await newIdea(ana, { title: 'Trocar a máquina de café' });

    await carla.put(`/api/ideas/${original}/like`).expect(200);
    await carla.put(`/api/ideas/${duplicate}/like`).expect(200);
    await davi.put(`/api/ideas/${duplicate}/like`).expect(200);
    // The original's Author liked the Duplicate: it does not become a Like on his own Idea.
    await bruno.put(`/api/ideas/${duplicate}/like`).expect(200);

    await changeStatus(duplicate, 'duplicate', { originalIdeaNumber: original });

    const who = await ana.get(`/api/ideas/${original}/likes`).expect(200);
    expect(names(who.body).sort()).toEqual(['Carla', 'Davi']);
    expect((await ana.get(`/api/ideas/${duplicate}`).expect(200)).body.likes.total).toBe(0);
  });

  it('sorts by trending, most liked and newest', async () => {
    const category = (await admin.post('/api/categories').send({ name: 'Ordenação' }).expect(201))
      .body.id;
    const create = (title: string) => newIdea(ana, { title, categoryId: category });

    // Old with many old Likes, old with a Like from today, and new without Likes.
    const oldPopular = await create('Old and popular');
    const oldRevived = await create('Old with recent support');
    const recent = await create('Recent');
    for (const who of [bruno, carla, davi]) {
      await who.put(`/api/ideas/${oldPopular}/like`).expect(200);
    }
    await bruno.put(`/api/ideas/${oldRevived}/like`).expect(200);

    const backdate = (number: number, interval: string) =>
      sim.pool.query(`update ideas set published_at = now() - $2::interval where number = $1`, [
        number,
        interval,
      ]);
    await backdate(oldPopular, '31 days');
    await backdate(oldRevived, '30 days');
    await sim.pool.query(
      `update likes set created_at = now() - interval '30 days'
       where idea_id = (select id from ideas where number = $1)`,
      [oldPopular],
    );

    const order = async (sort?: string) => {
      const { body } = await bruno
        .get('/api/ideas')
        .query({ categoryId: category, ...(sort ? { sort } : {}) })
        .expect(200);
      return body.items.map((i: { number: number }) => i.number);
    };

    // Trending is the default: recent support weighs more than a month-old pile.
    expect(await order()).toEqual([oldRevived, recent, oldPopular]);
    expect(await order('most_liked')).toEqual([oldPopular, oldRevived, recent]);
    expect(await order('newest')).toEqual([recent, oldRevived, oldPopular]);
  });
});
