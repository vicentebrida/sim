import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutoArchiveService } from '../src/ideas/auto-archive.service';
import { autoArchiveStage } from '../src/ideas/domain/auto-archive';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

const DAY = 86_400_000;

describe('autoArchiveStage', () => {
  const last = new Date('2026-01-01T00:00:00Z');
  const at = (days: number) => new Date(last.getTime() + days * DAY);

  it('warns 7 days before, and archives only after a full warning period', () => {
    const idea = { lastActivity: last, archiveWarnedAt: null };
    expect(autoArchiveStage(idea, at(22), 30)).toBe('none');
    expect(autoArchiveStage(idea, at(23), 30)).toBe('warn');
    // Turned on late: the Idea is long inactive, but the Author still gets the 7 days.
    expect(autoArchiveStage(idea, at(200), 30)).toBe('warn');
    const warned = { ...idea, archiveWarnedAt: at(23) };
    expect(autoArchiveStage(warned, at(29), 30)).toBe('none');
    expect(autoArchiveStage(warned, at(30), 30)).toBe('archive');
    const warnedLate = { ...idea, archiveWarnedAt: at(200) };
    expect(autoArchiveStage(warnedLate, at(206), 30)).toBe('none');
    expect(autoArchiveStage(warnedLate, at(207), 30)).toBe('archive');
  });

  it('starts over after any activity', () => {
    const idea = { lastActivity: at(25), archiveWarnedAt: at(23) };
    expect(autoArchiveStage(idea, at(31), 30)).toBe('none');
    expect(autoArchiveStage(idea, at(48), 30)).toBe('warn');
  });
});

describe('Automatic archiving', () => {
  let sim: TestApp;
  let service: AutoArchiveService;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser; // TI Reviewer
  let carla: Browser;
  let ti: string;
  let values: Record<string, string>;

  const newIdea = async () =>
    (
      await ana
        .post('/api/ideas')
        .send({ title: 'Ideia esquecida', categoryId: ti, values, publish: true })
        .expect(201)
    ).body.number as number;
  // Moves everything that counts as activity on the Idea to `days` ago.
  const age = async (number: number, days: number) => {
    await sim.pool.query(
      `update ideas set published_at = now() - make_interval(days => $2),
         status_changed_at = now() - make_interval(days => $2)
       where number = $1`,
      [number, days],
    );
    for (const table of ['likes', 'comments']) {
      await sim.pool.query(
        `update ${table} set created_at = now() - make_interval(days => $2)
          where idea_id = (select id from ideas where number = $1)`,
        [number, days],
      );
    }
  };
  const inDays = (days: number) => new Date(Date.now() + days * DAY);
  const unread = async (who: Browser) => {
    const { body } = await who.get('/api/notifications?pageSize=50').expect(200);
    await who.post('/api/notifications/read-all').expect(204);
    return (body.items as { type: string; read: boolean; idea: { number: number } }[]).filter(
      (n) => !n.read,
    );
  };
  const detail = async (number: number) =>
    (await carla.get(`/api/ideas/${number}`).expect(200)).body;
  const setDays = (days: number | null) =>
    admin.patch('/api/settings').send({ autoArchive: { days } }).expect(200);

  beforeAll(async () => {
    sim = await createApp();
    service = sim.app.get(AutoArchiveService);
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

  it('is off by default, and the Administrator turns it on (at least 14 days)', async () => {
    const number = await newIdea();
    await age(number, 400);
    expect(await service.check()).toBe(0);

    expect((await admin.get('/api/settings').expect(200)).body.autoArchive).toEqual({ days: null });
    await admin
      .patch('/api/settings')
      .send({ autoArchive: { days: 7 } })
      .expect(400);
    await bruno
      .patch('/api/settings')
      .send({ autoArchive: { days: 30 } })
      .expect(403);
    await setDays(30);
    const audit = (await admin.get('/api/audit').expect(200)).body.items[0];
    expect(audit).toMatchObject({ action: 'settings.auto_archive_changed', details: { days: 30 } });
  });

  it('warns the Author, then archives as the SIM and tells the Followers', async () => {
    const number = await newIdea();
    await carla.put(`/api/ideas/${number}/follow`).expect(200);
    await age(number, 24);
    await unread(ana);

    await service.check();
    const warning = (await unread(ana)).filter((n) => n.idea.number === number);
    expect(warning.map((n) => n.type)).toEqual(['archive_warning']);
    // Warned once only.
    await service.check(inDays(3));
    expect((await unread(ana)).filter((n) => n.idea.number === number)).toEqual([]);
    expect((await detail(number)).status).toBe('open');

    await service.check(inDays(7));
    const idea = await detail(number);
    expect(idea.status).toBe('archived');
    expect(idea.history.at(-1)).toMatchObject({
      from: 'open',
      to: 'archived',
      collaborator: null,
      justification: 'Arquivada automaticamente: sem Curtidas, Comentários nem edições há 30 dias.',
    });
    const told = (await unread(carla)).find((n) => n.idea.number === number);
    expect(told).toMatchObject({ type: 'status', actor: null });

    // The Reviewers can bring it back, as with any archived Idea.
    await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'open', justification: 'Voltou a ser relevante' })
      .expect(200);
  });

  it('a Like or a Comment starts the count over', async () => {
    const number = await newIdea();
    await age(number, 24);
    await service.check();
    expect((await unread(ana)).some((n) => n.type === 'archive_warning')).toBe(true);

    await carla.put(`/api/ideas/${number}/like`).expect(200);
    await service.check(inDays(7));
    expect((await detail(number)).status).toBe('open');
  });

  it('leaves alone Ideas under review (Stalled Ideas take care of them)', async () => {
    const number = await newIdea();
    await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'under_review', justification: 'Vamos olhar' })
      .expect(200);
    await age(number, 100);
    await service.check(inDays(30));
    expect((await detail(number)).status).toBe('under_review');
  });

  it('changing the rule cancels the warnings already given', async () => {
    const number = await newIdea();
    await age(number, 24);
    await service.check();
    await setDays(60);
    await setDays(30);
    // Without a new warning it cannot be archived.
    await service.check(inDays(7));
    expect((await detail(number)).status).toBe('open');

    await setDays(null);
    expect(await service.check(inDays(100))).toBe(0);
  });
});
