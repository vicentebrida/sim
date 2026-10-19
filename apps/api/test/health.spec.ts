import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AppDeTeste, criarApp } from './support/app';

describe('GET /api/health', () => {
  let sim: AppDeTeste;

  beforeAll(async () => {
    sim = await criarApp();
  });

  afterAll(() => sim.fechar());

  it('informa que a API e o banco estão no ar, sem exigir sessão', async () => {
    const response = await sim.http().get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('aplica as extensões de busca textual', async () => {
    const { rows } = await sim.pool.query<{ extname: string }>(
      `select extname from pg_extension order by extname`,
    );
    expect(rows.map((row) => row.extname)).toEqual(expect.arrayContaining(['pg_trgm', 'unaccent']));
  });
});
