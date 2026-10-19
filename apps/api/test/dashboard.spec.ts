import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOM, toCsv } from '../src/dashboard/csv';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('toCsv', () => {
  it('quotes, escapes and neutralizes spreadsheet formulas', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['diz "oi", ok', 1],
        ['=HYPERLINK("x")', null],
        ['-1+1', 'x;y'],
      ],
    );
    expect(csv).toBe(`${BOM}a,b\r\n"diz ""oi"", ok",1\r\n"'=HYPERLINK(""x"")",\r\n'-1+1,"x;y"\r\n`);
  });
});

describe('Dashboard', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser;
  let ti: string;
  let rh: string;
  let values: Record<string, string>;
  const number: Record<string, number> = {};

  const publish = async (title: string, categoryId: string) =>
    (await ana.post('/api/ideas').send({ title, categoryId, values, publish: true }).expect(201))
      .body.number as number;
  const status = (n: number, to: string) =>
    admin.post(`/api/ideas/${n}/status`).send({ to, justification: 'Ok' }).expect(200);

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    bruno = (await createCollaborator(sim, admin, 'Bruno')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    rh = (await admin.post('/api/categories').send({ name: 'RH' }).expect(201)).body.id;
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));

    number.approved = await publish('Aprovada', ti);
    number.popular = await publish('Muito curtida', ti);
    number.stale = await publish('Esquecida', rh);
    number.review = await publish('Em análise', rh);
    await ana.post('/api/ideas').send({ title: 'Rascunho', categoryId: ti }).expect(201);

    await bruno.put(`/api/ideas/${number.popular}/like`).expect(200);
    await status(number.review!, 'under_review');
    await status(number.approved!, 'under_review');
    await status(number.approved!, 'approved');
    // Published 10 hours before the decision.
    await sim.pool.query(
      `update ideas set published_at = now() - interval '10 hours' where number = $1`,
      [number.approved],
    );
    await sim.pool.query(
      `update ideas set status_changed_at = now() - interval '20 days' where number = $1`,
      [number.stale],
    );
  });

  afterAll(() => sim.close());

  it('is for Administrators only', async () => {
    await ana.get('/api/dashboard').expect(403);
    await ana.get('/api/dashboard/export').expect(403);
    await sim.http().get('/api/dashboard').expect(401);
  });

  it('counts Ideas by Status and Category, without Drafts', async () => {
    const { body } = await admin.get('/api/dashboard').expect(200);
    const byStatus = Object.fromEntries(
      body.byStatus.map((s: { status: string; total: number }) => [s.status, s.total]),
    );
    expect(byStatus).toEqual({ open: 2, under_review: 1, approved: 1 });
    expect(body.byCategory).toEqual([
      expect.objectContaining({ name: 'RH', total: 2, undecided: 2 }),
      expect.objectContaining({ name: 'TI', total: 2, undecided: 1 }),
    ]);
  });

  it('averages the time from publication to the first decision', async () => {
    const { body } = await admin.get('/api/dashboard').expect(200);
    expect(body.firstDecision.decided).toBe(1);
    expect(body.firstDecision.averageHours).toBeCloseTo(10, 0);
  });

  it('lists Stalled Ideas and the most liked ones not yet decided', async () => {
    const { body } = await admin.get('/api/dashboard').expect(200);
    expect(body.stalled).toEqual([
      expect.objectContaining({ number: number.stale, category: 'RH', days: 20 }),
    ]);
    expect(body.mostLikedUndecided[0]).toMatchObject({ number: number.popular, likes: 1 });
    expect(body.mostLikedUndecided.map((i: { number: number }) => i.number)).not.toContain(
      number.approved,
    );
  });

  it('exports every published Idea as CSV', async () => {
    const response = await admin.get('/api/dashboard/export').expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    const lines = response.text.replace(BOM, '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'number,title,status,category,author,published_at,status_changed_at,first_decision_at,likes,comments,stalled',
    );
    expect(lines).toHaveLength(5); // header + 4 published Ideas, no Draft
    const approved = lines.find((line) => line.includes('Aprovada'))!.split(',');
    expect(approved.slice(2, 5)).toEqual(['approved', 'TI', 'Ana']);
    expect(approved[7]).not.toBe('');
    expect(lines.find((line) => line.includes('Esquecida'))).toMatch(/,yes$/);
  });
});
