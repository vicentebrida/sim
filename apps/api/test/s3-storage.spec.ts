import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { S3Storage } from '../src/attachments/file-storage';
import { createApp, createCollaborator, signInAsAdministrator, type TestApp } from './support/app';

/** Just enough of S3 (path-style PUT, GET and DELETE of objects) to test against. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const requests: { method: string; path: string; authorization?: string }[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const path = decodeURIComponent((request.url ?? '').split('?')[0]!);
      requests.push({
        method: request.method!,
        path,
        authorization: request.headers.authorization,
      });
      if (request.method === 'PUT') {
        objects.set(path, Buffer.concat(chunks));
        response.writeHead(200, { etag: '"x"' }).end();
      } else if (request.method === 'GET') {
        const body = objects.get(path);
        if (!body) {
          response.writeHead(404, { 'content-type': 'application/xml' });
          response.end('<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
        } else {
          response.writeHead(200, { 'content-length': body.length }).end(body);
        }
      } else if (request.method === 'DELETE') {
        objects.delete(path);
        response.writeHead(204).end();
      } else {
        response.writeHead(405).end();
      }
    });
  });
  return {
    objects,
    requests,
    start: async () => {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

const KEY = '5c1f0a54-6a07-4b6c-9d57-4b1f3c2d1e00';

describe('S3Storage', () => {
  const s3 = fakeS3();
  let storage: S3Storage;

  beforeAll(async () => {
    storage = new S3Storage({
      bucket: 'sim',
      region: 'us-east-1',
      endpoint: await s3.start(),
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
    });
  });

  afterAll(() => s3.stop());

  it('saves, reads and removes objects under attachments/ in the bucket, signed', async () => {
    await storage.save(KEY, Buffer.from('conteúdo'));
    expect(s3.objects.get(`/sim/attachments/${KEY}`)?.toString()).toBe('conteúdo');
    expect(s3.requests[0]!.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=key\//);

    const chunks: Buffer[] = [];
    for await (const chunk of await storage.read(KEY)) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('conteúdo');

    await storage.remove(KEY);
    expect(s3.objects.size).toBe(0);
    await expect(storage.read(KEY)).rejects.toThrow();
  });

  it('refuses keys that are not generated ids', async () => {
    await expect(storage.save('../escape', Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
  });
});

describe('Attachments on S3', () => {
  const s3 = fakeS3();
  let sim: TestApp;

  beforeAll(async () => {
    sim = await createApp({
      SIM_STORAGE: 's3',
      SIM_S3_BUCKET: 'sim',
      SIM_S3_ENDPOINT: await s3.start(),
      SIM_S3_ACCESS_KEY_ID: 'key',
      SIM_S3_SECRET_ACCESS_KEY: 'secret',
      SIM_S3_FORCE_PATH_STYLE: 'true',
    });
  });

  afterAll(async () => {
    await sim.close();
    await s3.stop();
  });

  it('keeps Attachments and identity images in the bucket, and serves them back', async () => {
    const admin = await signInAsAdministrator(sim);
    const ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const category = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    const number = (
      await ana
        .post('/api/ideas')
        .send({
          title: 'Com anexo no S3',
          categoryId: category,
          values: Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto'])),
          publish: true,
        })
        .expect(201)
    ).body.number;

    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const attachment = (
      await ana.post(`/api/ideas/${number}/attachments`).attach('file', png, 'foto.png').expect(201)
    ).body;
    expect(
      [...s3.objects.keys()].filter((key) => key.startsWith('/sim/attachments/')),
    ).toHaveLength(1);

    const file = await ana.get(`/api/attachments/${attachment.id}`).expect(200);
    expect(Buffer.from(file.body)).toEqual(png);

    await admin.put('/api/branding/assets/logoLight').attach('file', png, 'logo.png').expect(200);
    expect(s3.objects.size).toBe(2);
    expect(
      Buffer.from((await sim.http().get('/api/branding/assets/logoLight').expect(200)).body),
    ).toEqual(png);

    await ana.delete(`/api/attachments/${attachment.id}`).expect(204);
    expect(s3.objects.size).toBe(1);
  });
});

describe('storage configuration', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost/db' };

  it('is the disk by default', () => {
    expect(loadEnv(base)).toMatchObject({ SIM_STORAGE: 'disk', SIM_S3_REGION: 'us-east-1' });
  });

  it('needs a bucket for S3, and the two keys together', () => {
    expect(() => loadEnv({ ...base, SIM_STORAGE: 's3' })).toThrow(/SIM_S3_BUCKET/);
    expect(() =>
      loadEnv({ ...base, SIM_STORAGE: 's3', SIM_S3_BUCKET: 'b', SIM_S3_ACCESS_KEY_ID: 'k' }),
    ).toThrow(/together/);
    expect(
      loadEnv({ ...base, SIM_STORAGE: 's3', SIM_S3_BUCKET: 'b' }).SIM_S3_FORCE_PATH_STYLE,
    ).toBe(false);
  });
});
