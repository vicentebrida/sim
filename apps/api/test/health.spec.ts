import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type TestApp } from './support/app';

describe('GET /api/health', () => {
  let sim: TestApp;

  beforeAll(async () => {
    sim = await createApp();
  });

  afterAll(() => sim.close());

  it('reports that the API and the database are up, without a session', async () => {
    const response = await sim.http().get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('applies the text search extensions', async () => {
    const { rows } = await sim.pool.query<{ extname: string }>(
      `select extname from pg_extension order by extname`,
    );
    expect(rows.map((row) => row.extname)).toEqual(expect.arrayContaining(['pg_trgm', 'unaccent']));
  });
});
