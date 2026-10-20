import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymousId, anonymousName, presentPerson } from '../src/ideas/domain/authorship';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('presentPerson', () => {
  const idea = {
    id: '5c1f0a54-6a07-4b6c-9d57-4b1f3c2d1e00',
    authorId: 'author',
    hiddenAuthorship: true,
  };
  const author = { id: 'author', name: 'Ana' };

  it('hides the Author from everyone but the Author', () => {
    const shown = presentPerson(idea, author, 'someone', 'pt-BR');
    expect(shown).toEqual({ id: anonymousId(idea.id), name: 'Colaborador anônimo' });
    expect(shown.id).not.toBe('author');
    expect(presentPerson(idea, author, 'author', 'pt-BR')).toEqual(author);
  });

  it('only hides the Author, and only when asked', () => {
    const other = { id: 'bruno', name: 'Bruno' };
    expect(presentPerson(idea, other, 'someone', 'pt-BR')).toEqual(other);
    expect(presentPerson({ ...idea, hiddenAuthorship: false }, author, 'someone', 'pt-BR')).toEqual(
      author,
    );
  });

  it('gives the same stand-in id for the same Idea, and a valid UUID', () => {
    expect(anonymousId(idea.id)).toBe(anonymousId(idea.id));
    expect(anonymousId(idea.id)).not.toBe(anonymousId('another-idea'));
    expect(anonymousId(idea.id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(anonymousName('en')).toBe('Anonymous collaborator');
  });
});

describe('Hidden authorship', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser; // hides her name
  let bruno: Browser; // Reviewer
  let carla: Browser;
  let ids: { ana: string; bruno: string };
  let ti: string;
  let values: Record<string, string>;

  const newIdea = async (hidden?: boolean) =>
    ana.post('/api/ideas').send({
      title: 'Ideia sensível',
      categoryId: ti,
      values,
      publish: true,
      hiddenAuthorship: hidden,
    });
  const audit = async () =>
    (await admin.get('/api/audit').expect(200)).body.items as {
      action: string;
      targetId: string;
      actor: { name: string };
    }[];

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    const a = await createCollaborator(sim, admin, 'Ana');
    const b = await createCollaborator(sim, admin, 'Bruno');
    ana = a.browser;
    bruno = b.browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;
    ids = { ana: a.id, bruno: b.id };
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [ids.bruno] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(() => sim.close());

  it('is off by default, so hiding is refused', async () => {
    expect((await ana.get('/api/settings').expect(200)).body).toMatchObject({
      hiddenAuthorshipEnabled: false,
    });
    const refused = await newIdea(true).then((r) => r);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('HIDDEN_AUTHORSHIP_DISABLED');
  });

  it('only Administrators turn it on, and it is audited', async () => {
    await ana.patch('/api/settings').send({ hiddenAuthorshipEnabled: true }).expect(403);
    await admin.patch('/api/settings').send({ hiddenAuthorshipEnabled: true }).expect(200);
    expect((await audit())[0]).toMatchObject({ action: 'settings.hidden_authorship_changed' });
  });

  describe('with the setting on', () => {
    let number: number;

    beforeAll(async () => {
      const created = await newIdea(true).then((r) => r);
      expect(created.status).toBe(201);
      number = created.body.number;
      // Comments from the hidden Author and from others, and a reply.
      const first = await bruno
        .post(`/api/ideas/${number}/comments`)
        .send({ text: 'Qual o prazo?' })
        .expect(201);
      await ana
        .post(`/api/ideas/${number}/comments`)
        .send({ text: 'Duas semanas', replyToId: first.body.id })
        .expect(201);
    });

    it('everyone but the Author sees an anonymous Author, with the same stand-in id everywhere', async () => {
      for (const viewer of [carla, bruno, admin]) {
        const detail = (await viewer.get(`/api/ideas/${number}`).expect(200)).body;
        expect(detail.author.name).toBe('Colaborador anônimo');
        expect(detail.author.id).not.toBe(ids.ana);
        expect(detail.hiddenAuthorship).toBe(true);
        expect(JSON.stringify(detail)).not.toContain('Ana');
        expect(JSON.stringify(detail)).not.toContain(ids.ana);

        const comments = (await viewer.get(`/api/ideas/${number}/comments`).expect(200)).body;
        const reply = comments[0].replies[0];
        expect(reply.author).toEqual(detail.author); // "the Author" can still be told apart
        expect(comments[0].author.name).toBe('Bruno');
        expect(JSON.stringify(comments)).not.toContain(ids.ana);
      }
    });

    it('the Author still sees their own name', async () => {
      const detail = (await ana.get(`/api/ideas/${number}`).expect(200)).body;
      expect(detail).toMatchObject({
        hiddenAuthorship: true,
        author: { id: ids.ana, name: 'Ana' },
      });
    });

    it('lists, History, Notifications and e-mail data do not leak the name', async () => {
      const list = (await carla.get('/api/ideas?pageSize=50').expect(200)).body.items;
      expect(list.find((i: { number: number }) => i.number === number).author.name).toBe(
        'Colaborador anônimo',
      );
      const detail = (await carla.get(`/api/ideas/${number}`).expect(200)).body;
      expect(detail.history[0].collaborator.name).toBe('Colaborador anônimo');

      const notified = (await bruno.get('/api/notifications?pageSize=50').expect(200)).body.items;
      const newIdea = notified.find((n: { type: string }) => n.type === 'new_idea');
      expect(newIdea.actor.name).toBe('Colaborador anônimo');
      expect(JSON.stringify(notified)).not.toContain(ids.ana);
    });

    it('the CSV export shows the stand-in too', async () => {
      const csv = (await admin.get('/api/dashboard/export').expect(200)).text;
      expect(csv).toContain('Colaborador anônimo');
      expect(csv).not.toContain(',Ana,');
    });

    it('only an Administrator can reveal, and each reveal is audited', async () => {
      await carla.post(`/api/ideas/${number}/reveal-author`).expect(403);
      await bruno.post(`/api/ideas/${number}/reveal-author`).expect(403);
      expect((await audit()).some((e) => e.action === 'authorship.revealed')).toBe(false);

      const revealed = await admin.post(`/api/ideas/${number}/reveal-author`).expect(200);
      expect(revealed.body).toEqual({ id: ids.ana, name: 'Ana' });
      await admin.post(`/api/ideas/${number}/reveal-author`).expect(200);
      const entries = (await audit()).filter((e) => e.action === 'authorship.revealed');
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        targetId: String(number),
        actor: { name: 'Administrador' },
      });
    });

    it('cannot reveal an Idea whose Author is not hidden', async () => {
      const open = (await newIdea(false).then((r) => r)).body.number;
      const refused = await admin.post(`/api/ideas/${open}/reveal-author`).expect(409);
      expect(refused.body.code).toBe('AUTHORSHIP_NOT_HIDDEN');
      expect((await carla.get(`/api/ideas/${open}`).expect(200)).body.author.name).toBe('Ana');
    });

    it('turning the setting off stops new hiding but keeps the existing Ideas hidden', async () => {
      await admin.patch('/api/settings').send({ hiddenAuthorshipEnabled: false }).expect(200);
      expect((await newIdea(true).then((r) => r)).status).toBe(400);
      expect((await carla.get(`/api/ideas/${number}`).expect(200)).body.author.name).toBe(
        'Colaborador anônimo',
      );
      // Showing the name again is always allowed.
      const detail = (
        await ana.patch(`/api/ideas/${number}`).send({ hiddenAuthorship: false }).expect(200)
      ).body;
      expect(detail.hiddenAuthorship).toBe(false);
      expect((await carla.get(`/api/ideas/${number}`).expect(200)).body.author.name).toBe('Ana');
    });
  });
});
