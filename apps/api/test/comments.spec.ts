import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

interface Comment {
  id: string;
  text: string | null;
  state: string;
  editedAt: string | null;
  hiding: { reason: string; by: { name: string } } | null;
  permissions: Record<string, boolean>;
  replies: Comment[];
}

describe('Comments', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser; // Author of the Ideas
  let bruno: Browser; // TI Reviewer
  let carla: Browser;
  let ids: { ana: string; bruno: string; carla: string; joao: string };
  let ti: string;
  let values: Record<string, string>;

  async function newIdea(data: Record<string, unknown> = {}) {
    const { body } = await ana
      .post('/api/ideas')
      .send({ title: 'Bicicletário coberto', categoryId: ti, values, publish: true, ...data })
      .expect(201);
    return body.number as number;
  }

  const comment = async (who: Browser, number: number, text: string, replyToId?: string) =>
    (await who.post(`/api/ideas/${number}/comments`).send({ text, replyToId }).expect(201))
      .body as Comment;

  const commentsSeenBy = async (who: Browser, number: number) =>
    (await who.get(`/api/ideas/${number}/comments`).expect(200)).body as Comment[];

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    const anaAccount = await createCollaborator(sim, admin, 'Ana');
    const brunoAccount = await createCollaborator(sim, admin, 'Bruno');
    const carlaAccount = await createCollaborator(sim, admin, 'Carla');
    const joaoAccount = await createCollaborator(sim, admin, 'João Araújo');
    [ana, bruno, carla] = [anaAccount.browser, brunoAccount.browser, carlaAccount.browser];
    ids = {
      ana: anaAccount.id,
      bruno: brunoAccount.id,
      carla: carlaAccount.id,
      joao: joaoAccount.id,
    };

    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin
      .put(`/api/categories/${ti}/reviewers`)
      .send({ collaboratorIds: [ids.bruno] })
      .expect(200);
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(
      fields.filter((f) => f.required).map((f) => [f.id, 'Example text']),
    );
  });

  afterAll(() => sim.close());

  it('Comments have one level of Replies, in chronological order', async () => {
    const number = await newIdea();
    const question = await comment(carla, number, 'Quantas vagas seriam?');
    const reply = await comment(ana, number, 'Umas 20', question.id);
    await comment(bruno, number, 'Vou levantar o custo');

    const list = await commentsSeenBy(carla, number);
    expect(list.map((c) => c.text)).toEqual(['Quantas vagas seriam?', 'Vou levantar o custo']);
    expect(list[0]!.replies.map((r) => r.text)).toEqual(['Umas 20']);
    expect(list[0]!.replies[0]!.permissions.canReply).toBe(false);

    const { body } = await carla
      .post(`/api/ideas/${number}/comments`)
      .send({ text: 'Reply to the reply', replyToId: reply.id })
      .expect(409);
    expect(body.code).toBe('COMMENT_UNAVAILABLE');
  });

  it('a Reply must be to a Comment on the same Idea', async () => {
    const oneIdea = await newIdea();
    const otherIdea = await newIdea();
    const first = await comment(carla, oneIdea, 'Comment on the first one');
    await carla
      .post(`/api/ideas/${otherIdea}/comments`)
      .send({ text: 'Crossed', replyToId: first.id })
      .expect(404);
  });

  it('an Archived Idea takes Comments, but a Draft does not', async () => {
    const archived = await newIdea();
    await admin
      .post(`/api/ideas/${archived}/status`)
      .send({ to: 'archived', justification: 'No progress' })
      .expect(200);
    await comment(carla, archived, 'Ainda acho importante');

    const { body } = await ana
      .post('/api/ideas')
      .send({ title: 'Rascunho', categoryId: ti })
      .expect(201);
    await carla.post(`/api/ideas/${body.number}/comments`).send({ text: 'Oi' }).expect(404);
    await ana.post(`/api/ideas/${body.number}/comments`).send({ text: 'Oi' }).expect(409);
  });

  it('Mentions record who was mentioned; inactive people become plain text', async () => {
    const number = await newIdea();
    await sim.pool.query('update collaborators set active = false where id = $1', [ids.joao]);

    const created = await comment(
      carla,
      number,
      `@[Bruno](${ids.bruno}) e @[João](${ids.joao}), o que acham?`,
    );
    expect(created.text).toBe(`@[Bruno](${ids.bruno}) e @João, o que acham?`);
    const { rows } = await sim.pool.query(
      'select collaborator_id from mentions where comment_id = $1',
      [created.id],
    );
    expect(rows.map((r) => r.collaborator_id)).toEqual([ids.bruno]);

    await sim.pool.query('update collaborators set active = true where id = $1', [ids.joao]);
  });

  it('the writer edits (marked "edited") and removes ("comment removed")', async () => {
    const number = await newIdea();
    const created = await comment(carla, number, `Falar com @[Ana](${ids.ana})`);
    await comment(ana, number, 'Combinado', created.id);

    await bruno.patch(`/api/comments/${created.id}`).send({ text: 'Intrusion' }).expect(403);
    const edited = await carla
      .patch(`/api/comments/${created.id}`)
      .send({ text: 'Falar com o RH' })
      .expect(200);
    expect(edited.body).toMatchObject({ text: 'Falar com o RH', state: 'published' });
    expect(edited.body.editedAt).not.toBeNull();
    const { rows } = await sim.pool.query('select 1 from mentions where comment_id = $1', [
      created.id,
    ]);
    expect(rows).toHaveLength(0);

    await carla.delete(`/api/comments/${created.id}`).expect(204);
    await carla.delete(`/api/comments/${created.id}`).expect(409);
    const [removed] = await commentsSeenBy(carla, number);
    expect(removed).toMatchObject({ state: 'removed', text: null });
    // The Replies stay.
    expect(removed!.replies.map((r) => r.text)).toEqual(['Combinado']);
  });

  it('a Reviewer hides with a reason; the text stays only for the writer and moderators', async () => {
    const number = await newIdea();
    const created = await comment(carla, number, 'Comentário ofensivo');

    await ana.post(`/api/comments/${created.id}/hide`).send({ reason: 'Não gostei' }).expect(403);
    await bruno.post(`/api/comments/${created.id}/hide`).send({ reason: '' }).expect(400);
    const hidden = await bruno
      .post(`/api/comments/${created.id}/hide`)
      .send({ reason: 'Desrespeita as regras de convivência' })
      .expect(200);
    expect(hidden.body).toMatchObject({
      state: 'hidden',
      text: 'Comentário ofensivo',
      hiding: { reason: 'Desrespeita as regras de convivência', by: { name: 'Bruno' } },
    });

    const [forAna] = await commentsSeenBy(ana, number);
    expect(forAna).toMatchObject({ state: 'hidden', text: null });
    expect(forAna!.hiding?.reason).toBe('Desrespeita as regras de convivência');
    const [forCarla] = await commentsSeenBy(carla, number);
    expect(forCarla).toMatchObject({ text: 'Comentário ofensivo' });
    expect(forCarla!.permissions).toMatchObject({ canEdit: false, canRemove: true });

    await carla
      .post(`/api/ideas/${number}/comments`)
      .send({ text: 'Replying to the hidden one', replyToId: created.id })
      .expect(409);
  });

  it('a Comment from someone else keeps the Author from deleting the Open Idea', async () => {
    const number = await newIdea();
    await comment(ana, number, 'The Author own Comment does not count');
    expect((await ana.get(`/api/ideas/${number}`).expect(200)).body.permissions.canDelete).toBe(
      true,
    );

    const created = await comment(carla, number, 'Boa ideia');
    await ana.delete(`/api/ideas/${number}`).expect(409);
    await carla.delete(`/api/comments/${created.id}`).expect(204);
    await ana.delete(`/api/ideas/${number}`).expect(204);
  });

  it('recent Comments push the Idea up in trending', async () => {
    const category = (await admin.post('/api/categories').send({ name: 'Em alta' }).expect(201))
      .body.id;
    const quiet = await newIdea({ categoryId: category, title: 'Quiet' });
    const discussed = await newIdea({ categoryId: category, title: 'Discussed' });
    await sim.pool.query(
      `update ideas set published_at = now() - interval '30 days' where number = $1`,
      [discussed],
    );
    await comment(carla, discussed, 'Retomando esta discussão');
    await comment(bruno, discussed, 'Vamos olhar no próximo comitê');

    const { body } = await carla.get('/api/ideas').query({ categoryId: category }).expect(200);
    expect(body.items.map((i: { number: number }) => i.number)).toEqual([discussed, quiet]);
  });

  it('any Collaborator searches who to mention, accent-insensitive', async () => {
    const { body } = await carla
      .get('/api/collaborators/mentionable')
      .query({ search: 'joao arau' })
      .expect(200);
    expect(body).toEqual([{ id: ids.joao, name: 'João Araújo' }]);

    await sim.pool.query('update collaborators set active = false where id = $1', [ids.joao]);
    await carla.get('/api/collaborators/mentionable').query({ search: 'joão' }).expect(200, []);
    // The full Collaborator list stays restricted to the Administrator.
    await carla.get('/api/collaborators').expect(403);
  });
});
