import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { OpenAiCompatibleProvider } from '../src/semantic/embedding-provider';

describe('OpenAiCompatibleProvider', () => {
  let server: Server;
  let url: string;
  let received: { path?: string; authorization?: string; body?: unknown } = {};
  let answer: (body: unknown) => { status: number; body: unknown } = () => ({
    status: 200,
    body: {},
  });

  beforeAll(async () => {
    server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        received = {
          path: request.url,
          authorization: request.headers.authorization,
          body: JSON.parse(raw),
        };
        const { status, body } = answer(received.body);
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('sends the model and the texts, with the key, and returns the vectors in order', async () => {
    // The service may answer out of order; `index` says which text each vector belongs to.
    answer = () => ({
      status: 200,
      body: {
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      },
    });
    const provider = new OpenAiCompatibleProvider({ url, model: 'm', apiKey: 'secret' });
    expect(await provider.embed(['a', 'b'])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(received).toEqual({
      path: '/v1/embeddings',
      authorization: 'Bearer secret',
      body: { model: 'm', input: ['a', 'b'] },
    });
  });

  it('works without a key (Ollama)', async () => {
    answer = () => ({ status: 200, body: { data: [{ index: 0, embedding: [1] }] } });
    await new OpenAiCompatibleProvider({ url, model: 'm' }).embed(['a']);
    expect(received.authorization).toBeUndefined();
  });

  it('fails clearly on errors and unexpected answers', async () => {
    const provider = new OpenAiCompatibleProvider({ url, model: 'm' });
    answer = () => ({ status: 401, body: { error: 'no' } });
    await expect(provider.embed(['a'])).rejects.toThrow('answered 401');
    answer = () => ({ status: 200, body: { data: [] } });
    await expect(provider.embed(['a'])).rejects.toThrow('unexpected answer');
  });
});

describe('semantic search configuration', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost/db' };

  it('is optional', () => {
    expect(loadEnv(base).SIM_EMBEDDINGS_URL).toBeUndefined();
    expect(loadEnv(base).SIM_SEMANTIC_THRESHOLD).toBe(0.75);
  });

  it('needs the model and Redis (the Ideas are indexed in the background)', () => {
    const url = { ...base, SIM_EMBEDDINGS_URL: 'http://ollama:11434/v1' };
    expect(() => loadEnv(url)).toThrow(/SIM_EMBEDDINGS_MODEL/);
    expect(() => loadEnv({ ...url, SIM_EMBEDDINGS_MODEL: 'nomic-embed-text' })).toThrow(
      /REDIS_URL/,
    );
    expect(
      loadEnv({ ...url, SIM_EMBEDDINGS_MODEL: 'nomic-embed-text', REDIS_URL: 'redis://redis:6379' })
        .SIM_EMBEDDINGS_MODEL,
    ).toBe('nomic-embed-text');
  });
});
