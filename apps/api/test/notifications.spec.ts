import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

interface Notification {
  id: string;
  type: string;
  idea: { number: number; title: string };
  actor: { name: string } | null;
  commentId: string | null;
  data: Record<string, unknown>;
  read: boolean;
}

describe('Following and Notifications', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser; // Author
  let bruno: Browser; // TI Reviewer
  let carla: Browser;
  let davi: Browser;
  let ids: { ana: string; bruno: string; carla: string; davi: string };
  let ti: string;
  let values: Record<string, string>;

  async function newIdea(who: Browser, data: Record<string, unknown> = {}) {
    const { body } = await who
      .post('/api/ideas')
      .send({ title: 'Estacionamento para motos', categoryId: ti, values, publish: true, ...data })
      .expect(201);
    return body.number as number;
  }

  const comment = async (who: Browser, number: number, text: string, replyToId?: string) =>
    (await who.post(`/api/ideas/${number}/comments`).send({ text, replyToId }).expect(201))
      .body as {
      id: string;
    };

  /** Notifications received since the last call (marks them all as read). */
  async function newNotifications(who: Browser) {
    const { body } = await who.get('/api/notifications?pageSize=50').expect(200);
    await who.post('/api/notifications/read-all').expect(204);
    return (body.items as Notification[]).filter((n) => !n.read);
  }

  const summary = (list: Notification[]) => list.map((n) => [n.type, n.idea.number]);

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    const accounts = {
      ana: await createCollaborator(sim, admin, 'Ana'),
      bruno: await createCollaborator(sim, admin, 'Bruno'),
      carla: await createCollaborator(sim, admin, 'Carla'),
      davi: await createCollaborator(sim, admin, 'Davi'),
    };
    [ana, bruno, carla, davi] = [
      accounts.ana.browser,
      accounts.bruno.browser,
      accounts.carla.browser,
      accounts.davi.browser,
    ];
    ids = {
      ana: accounts.ana.id,
      bruno: accounts.bruno.id,
      carla: accounts.carla.id,
      davi: accounts.davi.id,
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

  // Each test starts with every bell empty.
  beforeEach(async () => {
    for (const who of [admin, ana, bruno, carla, davi]) await newNotifications(who);
  });

  afterAll(() => sim.close());

  describe('Following', () => {
    it('the Author follows from the start; liking and commenting also follow', async () => {
      const number = await newIdea(ana);
      expect((await ana.get(`/api/ideas/${number}`).expect(200)).body.following).toBe(true);
      expect((await carla.get(`/api/ideas/${number}`).expect(200)).body.following).toBe(false);

      await carla.put(`/api/ideas/${number}/like`).expect(200);
      await davi.post(`/api/ideas/${number}/comments`).send({ text: 'Apoio' }).expect(201);
      for (const who of [carla, davi]) {
        expect((await who.get(`/api/ideas/${number}`).expect(200)).body.following).toBe(true);
      }
    });

    it('anyone can follow manually and unfollow, and filter the Ideas they follow', async () => {
      const number = await newIdea(ana, { title: 'Ideia para seguir' });
      await davi.put(`/api/ideas/${number}/follow`).expect(200, { following: true });

      const followed = await davi.get('/api/ideas?following=true&pageSize=50').expect(200);
      expect(followed.body.items.map((i: { number: number }) => i.number)).toContain(number);

      await davi.delete(`/api/ideas/${number}/follow`).expect(200, { following: false });
      const after = await davi.get('/api/ideas?following=true&pageSize=50').expect(200);
      expect(after.body.items.map((i: { number: number }) => i.number)).not.toContain(number);
    });
  });

  describe('Notifications', () => {
    it('a published Idea notifies the Category Reviewers, not its Author', async () => {
      const number = await newIdea(ana);
      expect(summary(await newNotifications(bruno))).toEqual([['new_idea', number]]);
      expect(await newNotifications(ana)).toEqual([]);

      // Drafts do not notify until published.
      const { body } = await ana
        .post('/api/ideas')
        .send({ title: 'Rascunho', categoryId: ti, values })
        .expect(201);
      expect(await newNotifications(bruno)).toEqual([]);
      await ana.post(`/api/ideas/${body.number}/publish`).expect(200);
      expect(summary(await newNotifications(bruno))).toEqual([['new_idea', body.number]]);
    });

    it('a Category without Reviewers notifies the Administrators', async () => {
      const empty = (
        await admin.post('/api/categories').send({ name: 'Sem avaliador' }).expect(201)
      ).body.id;
      const number = await newIdea(ana, { categoryId: empty });
      expect(summary(await newNotifications(admin))).toEqual([['new_idea', number]]);
      expect(await newNotifications(bruno)).toEqual([]);
    });

    it('a Status change notifies the Followers, except whoever changed it', async () => {
      const number = await newIdea(ana);
      await carla.put(`/api/ideas/${number}/follow`).expect(200);
      await bruno.put(`/api/ideas/${number}/follow`).expect(200);
      await newNotifications(bruno);

      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'Vamos avaliar' })
        .expect(200);

      for (const who of [ana, carla]) {
        const [notification] = await newNotifications(who);
        expect(notification).toMatchObject({
          type: 'status',
          idea: { number },
          actor: { name: 'Bruno' },
          data: { from: 'open', to: 'under_review' },
        });
      }
      expect(await newNotifications(bruno)).toEqual([]);
    });

    it('a Duplicate notifies its Followers with the original Idea, which they start following', async () => {
      const original = await newIdea(carla, { title: 'Original' });
      const duplicate = await newIdea(ana, { title: 'Repetida' });
      await davi.put(`/api/ideas/${duplicate}/follow`).expect(200);
      await newNotifications(davi);

      await bruno
        .post(`/api/ideas/${duplicate}/status`)
        .send({ to: 'duplicate', justification: 'Já existe', originalIdeaNumber: original })
        .expect(200);

      const [notification] = await newNotifications(davi);
      expect(notification).toMatchObject({
        type: 'duplicate',
        idea: { number: duplicate },
        data: { original: { number: original, title: 'Original' } },
      });
      expect((await davi.get(`/api/ideas/${original}`).expect(200)).body.following).toBe(true);
    });

    it('recategorizing notifies the Reviewers of the new Category', async () => {
      const processes = (
        await admin.post('/api/categories').send({ name: 'Processos' }).expect(201)
      ).body.id;
      await admin
        .put(`/api/categories/${processes}/reviewers`)
        .send({ collaboratorIds: [ids.davi] })
        .expect(200);
      const number = await newIdea(ana);
      await newNotifications(davi);

      await bruno
        .post(`/api/ideas/${number}/category`)
        .send({ categoryId: processes, justification: 'É de processo' })
        .expect(200);
      expect(summary(await newNotifications(davi))).toEqual([['new_idea', number]]);
    });

    it('a Comment notifies Followers, the replied author and the mentioned, once each', async () => {
      const number = await newIdea(ana);
      const question = await comment(carla, number, 'Quantas vagas?');
      for (const who of [ana, bruno, carla, davi]) await newNotifications(who);

      const reply = await comment(
        bruno,
        number,
        `Umas 10. @[Davi](${ids.davi}), você cuida disso?`,
        question.id,
      );

      expect(await newNotifications(ana)).toEqual([
        expect.objectContaining({
          type: 'comment',
          commentId: reply.id,
          actor: { id: ids.bruno, name: 'Bruno' },
        }),
      ]);
      expect(summary(await newNotifications(carla))).toEqual([['reply', number]]);
      expect(summary(await newNotifications(davi))).toEqual([['mention', number]]);
      expect(await newNotifications(bruno)).toEqual([]);
    });

    it('turning off new Comment notifications keeps Replies and Mentions', async () => {
      await ana.put('/api/notifications/preferences').send({ newComments: false }).expect(200);
      expect((await ana.get('/api/notifications/preferences').expect(200)).body).toMatchObject({
        newComments: false,
      });

      const number = await newIdea(ana);
      const first = await comment(carla, number, 'Comentário comum');
      expect(await newNotifications(ana)).toEqual([]);

      await comment(carla, number, `@[Ana](${ids.ana}), pode ver isto?`);
      expect(summary(await newNotifications(ana))).toEqual([['mention', number]]);
      await comment(bruno, number, 'Respondendo', first.id);
      expect(await newNotifications(ana)).toEqual([]);

      await ana.put('/api/notifications/preferences').send({ newComments: true }).expect(200);
    });

    it('editing a Comment only notifies people newly mentioned', async () => {
      const number = await newIdea(ana);
      const created = await comment(carla, number, `Oi @[Bruno](${ids.bruno})`);
      await newNotifications(bruno);
      await newNotifications(davi);

      await carla
        .patch(`/api/comments/${created.id}`)
        .send({ text: `Oi @[Bruno](${ids.bruno}) e @[Davi](${ids.davi})` })
        .expect(200);
      expect(await newNotifications(bruno)).toEqual([]);
      expect(summary(await newNotifications(davi))).toEqual([['mention', number]]);
    });
  });

  describe('the bell', () => {
    it('counts unread, marks one or all as read, and only for the recipient', async () => {
      await newNotifications(bruno);
      const first = await newIdea(ana);
      const second = await newIdea(ana);

      expect((await bruno.get('/api/notifications/unread-count').expect(200)).body).toEqual({
        unread: 2,
      });
      const { body } = await bruno.get('/api/notifications').expect(200);
      expect(body.items.slice(0, 2).map((n: Notification) => n.idea.number)).toEqual([
        second,
        first,
      ]);
      expect(body.unread).toBe(2);

      await carla.post(`/api/notifications/${body.items[0].id}/read`).expect(404);
      await bruno.post(`/api/notifications/${body.items[0].id}/read`).expect(204);
      expect((await bruno.get('/api/notifications/unread-count').expect(200)).body.unread).toBe(1);

      await bruno.post('/api/notifications/read-all').expect(204);
      expect((await bruno.get('/api/notifications/unread-count').expect(200)).body.unread).toBe(0);
    });
  });
});
