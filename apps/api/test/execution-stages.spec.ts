import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('Execution steps', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser; // TI Reviewer
  let carla: Browser;
  let ti: string;
  let values: Record<string, string>;
  const stage: Record<string, string> = {};

  const newIdea = async () =>
    (
      await ana
        .post('/api/ideas')
        .send({ title: 'Ideia em execução', categoryId: ti, values, publish: true })
        .expect(201)
    ).body.number as number;
  const move = (number: number, to: string) =>
    bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to, justification: `Para ${to}` })
      .expect(200);
  const unread = async (who: Browser) => {
    const { body } = await who.get('/api/notifications?pageSize=50').expect(200);
    await who.post('/api/notifications/read-all').expect(204);
    return (body.items as { type: string; read: boolean; data: object }[]).filter((n) => !n.read);
  };

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const brunoAccount = await createCollaborator(sim, admin, 'Bruno');
    bruno = brunoAccount.browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [brunoAccount.id] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(() => sim.close());

  it('the Administrator keeps one ordered list of steps', async () => {
    for (const name of ['Planejamento', 'Desenvolvimento', 'Implantação']) {
      stage[name] = (await admin.post('/api/execution-stages').send({ name }).expect(201)).body.id;
    }
    const conflict = await admin
      .post('/api/execution-stages')
      .send({ name: 'planejamento' })
      .expect(409);
    expect(conflict.body.code).toBe('STAGE_NAME_TAKEN');
    await bruno.post('/api/execution-stages').send({ name: 'Testes' }).expect(403);

    const reordered = await admin
      .put('/api/execution-stages/order')
      .send({ ids: [stage.Desenvolvimento, stage.Planejamento, stage['Implantação']] })
      .expect(200);
    expect(reordered.body.map((s: { name: string }) => s.name)).toEqual([
      'Desenvolvimento',
      'Planejamento',
      'Implantação',
    ]);
    await admin
      .put('/api/execution-stages/order')
      .send({ ids: [stage.Planejamento] })
      .expect(400);
    await admin
      .put('/api/execution-stages/order')
      .send({ ids: [stage.Planejamento, stage.Desenvolvimento, stage['Implantação']] })
      .expect(200);

    await admin
      .patch(`/api/execution-stages/${stage['Implantação']}`)
      .send({ name: 'Implantação em produção' })
      .expect(200);
    // Everyone signed in reads them (the Idea page shows them).
    const list = (await carla.get('/api/execution-stages').expect(200)).body;
    expect(list.map((s: { name: string }) => s.name)).toEqual([
      'Planejamento',
      'Desenvolvimento',
      'Implantação em produção',
    ]);
  });

  it('Reviewers move an In progress Idea through the steps, in any order', async () => {
    const number = await newIdea();
    await carla.put(`/api/ideas/${number}/follow`).expect(200);
    const early = await bruno
      .put(`/api/ideas/${number}/stage`)
      .send({ stageId: stage.Planejamento })
      .expect(409);
    expect(early.body.code).toBe('STAGE_UNAVAILABLE');

    await move(number, 'under_review');
    await move(number, 'approved');
    const inProgress = (await move(number, 'in_progress')).body;
    expect(inProgress.stage).toBeNull();
    expect(inProgress.permissions.canSetStage).toBe(true);
    await unread(carla);

    await ana.put(`/api/ideas/${number}/stage`).send({ stageId: stage.Planejamento }).expect(403);
    // Skipping a step is fine.
    const developing = await bruno
      .put(`/api/ideas/${number}/stage`)
      .send({ stageId: stage.Desenvolvimento, justification: 'Começamos pelo código' })
      .expect(200);
    expect(developing.body.stage).toEqual({ id: stage.Desenvolvimento, name: 'Desenvolvimento' });
    // And going back too.
    const back = await bruno
      .put(`/api/ideas/${number}/stage`)
      .send({ stageId: stage.Planejamento })
      .expect(200);
    expect(back.body.history.slice(-2)).toMatchObject([
      {
        type: 'stage',
        from: null,
        to: 'Desenvolvimento',
        justification: 'Começamos pelo código',
        collaborator: { name: 'Bruno' },
      },
      { type: 'stage', from: 'Desenvolvimento', to: 'Planejamento', justification: null },
    ]);
    expect((await unread(carla)).map((n) => n.data)).toEqual([
      { stage: 'Planejamento' },
      { stage: 'Desenvolvimento' },
    ]);

    const list = (await carla.get('/api/ideas?status=in_progress').expect(200)).body;
    expect(list.items.find((i: { number: number }) => i.number === number).stage).toEqual({
      id: stage.Planejamento,
      name: 'Planejamento',
    });

    await bruno
      .put(`/api/ideas/${number}/stage`)
      .send({ stageId: '00000000-0000-4000-8000-000000000000' })
      .expect(400);

    // Leaving In progress ends the step; the History keeps it.
    const done = (await move(number, 'done')).body;
    expect(done.stage).toBeNull();
    expect(done.history.filter((h: { type: string }) => h.type === 'stage')).toHaveLength(2);
  });

  it('deleting a step leaves its Ideas In progress without a step', async () => {
    const number = await newIdea();
    await move(number, 'under_review');
    await move(number, 'approved');
    await move(number, 'in_progress');
    await bruno
      .put(`/api/ideas/${number}/stage`)
      .send({ stageId: stage['Implantação'] })
      .expect(200);

    await admin.delete(`/api/execution-stages/${stage['Implantação']}`).expect(204);
    const idea = (await carla.get(`/api/ideas/${number}`).expect(200)).body;
    expect(idea.status).toBe('in_progress');
    expect(idea.stage).toBeNull();
    expect(idea.history.at(-1)).toMatchObject({ type: 'stage', to: 'Implantação em produção' });
  });

  it('allows at most 10 steps', async () => {
    for (let index = 3; index <= 10; index += 1) {
      await admin
        .post('/api/execution-stages')
        .send({ name: `Etapa ${index}` })
        .expect(201);
    }
    const limit = await admin
      .post('/api/execution-stages')
      .send({ name: 'Uma a mais' })
      .expect(409);
    expect(limit.body.code).toBe('TOO_MANY_STAGES');
  });
});
