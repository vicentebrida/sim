import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('Recognition', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let anaId: string;
  let bruno: Browser; // TI Reviewer
  let carla: Browser;
  let ti: string;
  let values: Record<string, string>;

  const newIdea = async (title: string, data: Record<string, unknown> = {}) =>
    (
      await ana
        .post('/api/ideas')
        .send({ title, categoryId: ti, values, publish: true, ...data })
        .expect(201)
    ).body.number as number;
  const complete = async (number: number) => {
    for (const to of ['under_review', 'approved', 'in_progress', 'done']) {
      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to, justification: `Para ${to}` })
        .expect(200);
    }
  };

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    const anaAccount = await createCollaborator(sim, admin, 'Ana');
    ana = anaAccount.browser;
    anaId = anaAccount.id;
    const brunoAccount = await createCollaborator(sim, admin, 'Bruno');
    bruno = brunoAccount.browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [brunoAccount.id] });
    await admin.patch('/api/settings').send({ hiddenAuthorshipEnabled: true }).expect(200);
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(() => sim.close());

  it('a profile shows only the Ideas carried out, with the Likes they got', async () => {
    const empty = (await carla.get(`/api/people/${anaId}`).expect(200)).body;
    expect(empty).toMatchObject({ name: 'Ana', active: true, completed: [], likesOnCompleted: 0 });

    const done = await newIdea('Relatório automático');
    await carla.put(`/api/ideas/${done}/like`).expect(200);
    await complete(done);
    // Sent, open or declined Ideas do not count: recognition is never about volume.
    await newIdea('Ainda aberta');
    const declined = await newIdea('Recusada');
    await bruno
      .post(`/api/ideas/${declined}/status`)
      .send({ to: 'under_review', justification: 'Vamos ver' })
      .expect(200);
    await bruno
      .post(`/api/ideas/${declined}/status`)
      .send({ to: 'declined', justification: 'Não cabe agora' })
      .expect(200);

    const profile = (await carla.get(`/api/people/${anaId}`).expect(200)).body;
    expect(profile.completed).toMatchObject([
      { number: done, title: 'Relatório automático', category: { name: 'TI' }, likes: 1 },
    ]);
    expect(profile.likesOnCompleted).toBe(1);

    const recent = (await carla.get('/api/recognition/recently-completed').expect(200)).body;
    expect(recent[0]).toMatchObject({ number: done, author: { id: anaId, name: 'Ana' } });
  });

  it('keeps hidden authorship hidden', async () => {
    const hidden = await newIdea('Ideia anônima', { hiddenAuthorship: true });
    await complete(hidden);

    const seenByOthers = (await carla.get(`/api/people/${anaId}`).expect(200)).body;
    expect(seenByOthers.completed.map((i: { number: number }) => i.number)).not.toContain(hidden);
    const ownView = (await ana.get(`/api/people/${anaId}`).expect(200)).body;
    expect(ownView.completed[0]).toMatchObject({ number: hidden, hiddenAuthorship: true });

    const recent = (await carla.get('/api/recognition/recently-completed').expect(200)).body;
    expect(recent[0]).toMatchObject({ number: hidden, hiddenAuthorship: true });
    expect(recent[0].author.id).not.toBe(anaId);
    expect(recent[0].author.name).toBe('Colaborador anônimo');
  });

  it('has no profile for unknown or anonymized people', async () => {
    await carla.get('/api/people/00000000-0000-4000-8000-000000000000').expect(404);
    const gone = await createCollaborator(sim, admin, 'Dora');
    await admin.patch(`/api/collaborators/${gone.id}`).send({ active: false }).expect(200);
    expect((await carla.get(`/api/people/${gone.id}`).expect(200)).body.active).toBe(false);
    await admin.post(`/api/collaborators/${gone.id}/anonymize`).expect(200);
    await carla.get(`/api/people/${gone.id}`).expect(404);
  });
});
