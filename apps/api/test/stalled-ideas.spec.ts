import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stalledStage } from '../src/ideas/domain/stalled';
import { StalledIdeasService } from '../src/ideas/stalled-ideas.service';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

const DAY = 86_400_000;

describe('stalledStage', () => {
  const changed = new Date('2026-01-01T00:00:00Z');
  const at = (days: number) => new Date(changed.getTime() + days * DAY);

  it('notifies the Reviewers first, then escalates after the waiting time, once', () => {
    const idea = { statusChangedAt: changed, stalledNotifiedAt: null, stalledEscalatedAt: null };
    expect(stalledStage(idea, at(16), 7)).toBe('notify_reviewers');
    const notified = { ...idea, stalledNotifiedAt: at(16) };
    expect(stalledStage(notified, at(22), 7)).toBe('none');
    expect(stalledStage(notified, at(23), 7)).toBe('escalate');
    expect(stalledStage({ ...notified, stalledEscalatedAt: at(23) }, at(60), 7)).toBe('none');
  });

  it('starts over after a Status change', () => {
    const idea = {
      statusChangedAt: at(30),
      stalledNotifiedAt: at(16),
      stalledEscalatedAt: at(23),
    };
    expect(stalledStage(idea, at(31), 7)).toBe('notify_reviewers');
  });
});

describe('Stalled Ideas', () => {
  let sim: TestApp;
  let stalled: StalledIdeasService;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser; // TI Reviewer
  let carla: Browser;
  let ids: { admin: string; bruno: string };
  let ti: string;
  let values: Record<string, string>;

  const newIdea = async (data: Record<string, unknown> = {}) =>
    (
      await ana
        .post('/api/ideas')
        .send({ title: 'Ideia parada', categoryId: ti, values, publish: true, ...data })
        .expect(201)
    ).body.number as number;
  // Moves the start of the current Status period to `days` ago; notices keep their order after it.
  const age = (number: number, days: number) =>
    sim.pool.query(
      `update ideas set
         stalled_notified_at = stalled_notified_at + (now() - make_interval(days => $2) - status_changed_at),
         stalled_escalated_at = stalled_escalated_at + (now() - make_interval(days => $2) - status_changed_at),
         status_changed_at = now() - make_interval(days => $2)
       where number = $1`,
      [number, days],
    );
  const types = async (who: Browser) => {
    const { body } = await who.get('/api/notifications?pageSize=50').expect(200);
    await who.post('/api/notifications/read-all').expect(204);
    return (body.items as { type: string; read: boolean }[])
      .filter((n) => !n.read && n.type.startsWith('stalled'))
      .map((n) => n.type);
  };
  const detail = async (who: Browser, number: number) =>
    (await who.get(`/api/ideas/${number}`).expect(200)).body;

  beforeAll(async () => {
    sim = await createApp();
    stalled = sim.app.get(StalledIdeasService);
    admin = await signInAsAdministrator(sim);
    const accounts = {
      ana: await createCollaborator(sim, admin, 'Ana'),
      bruno: await createCollaborator(sim, admin, 'Bruno'),
      carla: await createCollaborator(sim, admin, 'Carla'),
    };
    [ana, bruno, carla] = [accounts.ana.browser, accounts.bruno.browser, accounts.carla.browser];
    ids = {
      admin: (await admin.get('/api/auth/me').expect(200)).body.id,
      bruno: accounts.bruno.id,
    };
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [ids.bruno] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  beforeEach(async () => {
    // Every Idea of the earlier tests is no longer stalled, and every bell is empty.
    await sim.pool.query('update ideas set status_changed_at = now()');
    for (const who of [admin, ana, bruno, carla]) await types(who);
  });

  afterAll(() => sim.close());

  it('uses the default deadlines: 15 days Open, 30 days Under review', async () => {
    const number = await newIdea();
    await age(number, 14);
    expect(await stalled.check()).toBe(0);
    await age(number, 16);
    expect(await stalled.check()).toBe(1);

    await admin
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'under_review', justification: 'Vamos ver' })
      .expect(200);
    await age(number, 29);
    expect(await stalled.check()).toBe(0);
    await age(number, 31);
    expect(await stalled.check()).toBe(1);
  });

  it('tells the Reviewers first and the Administrators later, once each', async () => {
    const number = await newIdea();
    await age(number, 16);

    await stalled.check();
    expect(await types(bruno)).toEqual(['stalled']);
    expect(await types(admin)).toEqual([]);
    expect(await types(ana)).toEqual([]); // the Author is not told

    await stalled.check();
    expect(await types(bruno)).toEqual([]);

    const later = new Date(Date.now() + 8 * DAY);
    expect(await stalled.check(later)).toBe(1);
    expect(await types(admin)).toEqual(['stalled_escalated']);
    expect(await types(bruno)).toEqual([]);

    expect(await stalled.check(new Date(Date.now() + 30 * DAY))).toBe(0);
  });

  it('a Category without Reviewers tells the Administrators', async () => {
    const empty = (await admin.post('/api/categories').send({ name: 'Sem avaliador' }).expect(201))
      .body.id;
    const number = await newIdea({ categoryId: empty });
    await age(number, 16);
    await stalled.check();
    expect(await types(admin)).toEqual(['stalled']);
  });

  it('a Category can set its own deadlines', async () => {
    const quick = (await admin.post('/api/categories').send({ name: 'Rápida' }).expect(201)).body
      .id;
    await admin.patch(`/api/categories/${quick}`).send({ stalledOpenDays: 3 }).expect(200);
    const number = await newIdea({ categoryId: quick });
    await age(number, 4);
    expect(await stalled.check()).toBe(1);

    const { body } = await admin.get(`/api/categories`).expect(200);
    expect(body.find((c: { id: string }) => c.id === quick)).toMatchObject({
      stalledOpenDays: 3,
      stalledReviewDays: null,
    });
    await admin.patch(`/api/categories/${quick}`).send({ stalledOpenDays: 0 }).expect(400);
  });

  it('a Status change starts over', async () => {
    const number = await newIdea();
    await age(number, 16);
    await stalled.check();
    await types(bruno);

    await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'under_review', justification: 'Analisando' })
      .expect(200);
    await types(ana);
    await age(number, 31);
    await stalled.check();
    expect(await types(bruno)).toEqual(['stalled']);
  });

  it('only Administrators and the Category Reviewers see the Stalled mark', async () => {
    const number = await newIdea();
    expect((await detail(bruno, number)).stalled).toBe(false);
    await age(number, 16);

    expect((await detail(bruno, number)).stalled).toBe(true);
    expect((await detail(admin, number)).stalled).toBe(true);
    expect((await detail(ana, number)).stalled).toBe(false);
    expect((await detail(carla, number)).stalled).toBe(false);

    const marks = async (who: Browser) =>
      (await who.get('/api/ideas?pageSize=50').expect(200)).body.items.find(
        (idea: { number: number }) => idea.number === number,
      ).stalled;
    expect(await marks(bruno)).toBe(true);
    expect(await marks(admin)).toBe(true);
    expect(await marks(ana)).toBe(false);
    expect(await marks(carla)).toBe(false);
  });
});
