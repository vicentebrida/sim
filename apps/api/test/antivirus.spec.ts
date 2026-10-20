import { createServer, type AddressInfo, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClamdClient } from '../src/antivirus/clamav';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

const EICAR = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
const VERSION = 'ClamAV 1.4.1/27431/Mon Oct 19 08:30:00 2026';

/** Plays clamd: answers VERSION and INSTREAM, finding "EICAR" in any stream. */
async function startClamd(reply?: string) {
  const scanned: number[] = [];
  const server: Server = createServer((socket) => {
    let data = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      if (data.toString('latin1').startsWith('zVERSION\0')) {
        socket.end(`${VERSION}\0`);
        return;
      }
      const prefix = 'zINSTREAM\0'.length;
      const parts: Buffer[] = [];
      for (let at = prefix; at + 4 <= data.length;) {
        const size = data.readUInt32BE(at);
        if (size === 0) {
          const content = Buffer.concat(parts);
          scanned.push(content.length);
          const infected = content.includes('EICAR');
          socket.end(
            `${reply ?? (infected ? 'stream: Eicar-Test-Signature FOUND' : 'stream: OK')}\0`,
          );
          return;
        }
        if (at + 4 + size > data.length) return;
        parts.push(data.subarray(at + 4, at + 4 + size));
        at += 4 + size;
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `tcp://127.0.0.1:${port}`,
    port,
    scanned,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('ClamdClient', () => {
  it('sends the file in chunks and reads the verdict', async () => {
    const clamd = await startClamd();
    const client = ClamdClient.fromUrl(clamd.url);
    const big = Buffer.alloc(200 * 1024, 'a');
    expect(await client.scan(big)).toEqual({ infected: false });
    expect(clamd.scanned).toEqual([big.length]);
    expect(await client.scan(EICAR)).toEqual({
      infected: true,
      signature: 'Eicar-Test-Signature',
    });
    expect(await client.version()).toBe(VERSION);
    await clamd.close();
  });

  it('raises on clamd errors and when it cannot connect', async () => {
    const clamd = await startClamd('INSTREAM size limit exceeded. ERROR');
    await expect(ClamdClient.fromUrl(clamd.url).scan(EICAR)).rejects.toThrow(
      'clamd: INSTREAM size limit exceeded. ERROR',
    );
    await clamd.close();
    await expect(ClamdClient.fromUrl(clamd.url).scan(EICAR)).rejects.toThrow();
  });
});

describe('Antivirus on Attachments', () => {
  let sim: TestApp;
  let clamd: Awaited<ReturnType<typeof startClamd>>;
  let admin: Browser;
  let ana: Browser;
  let number: number;

  beforeAll(async () => {
    clamd = await startClamd();
    sim = await createApp({ SIM_CLAMAV_URL: clamd.url });
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    const values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
    number = (
      await ana
        .post('/api/ideas')
        .send({ title: 'Com anexos', categoryId: ti, values, publish: true })
        .expect(201)
    ).body.number;
  });

  afterAll(async () => {
    await sim.close();
    await clamd.close();
  });

  it('stores a clean file after checking it', async () => {
    const { body } = await ana
      .post(`/api/ideas/${number}/attachments`)
      .attach('file', Buffer.from('tudo certo'), 'nota.txt')
      .expect(201);
    expect(body.filename).toBe('nota.txt');
    expect(clamd.scanned.at(-1)).toBe('tudo certo'.length);
  });

  it('refuses an infected file, keeps nothing and records it in the Audit', async () => {
    const response = await ana
      .post(`/api/ideas/${number}/attachments`)
      .attach('file', EICAR, 'eicar.txt')
      .expect(422);
    expect(response.body.code).toBe('ATTACHMENT_INFECTED');

    const detail = (await ana.get(`/api/ideas/${number}`).expect(200)).body;
    expect(detail.attachments.map((a: { filename: string }) => a.filename)).toEqual(['nota.txt']);

    const audit = (await admin.get('/api/audit').expect(200)).body;
    expect(audit.items[0]).toMatchObject({
      action: 'attachment.infected',
      actor: { name: 'Ana' },
      targetType: 'idea',
      details: { filename: 'eicar.txt', signature: 'Eicar-Test-Signature' },
    });
  });

  it('shows the antivirus in Integrations and tests it', async () => {
    const integrations = (await admin.get('/api/integrations').expect(200)).body;
    expect(integrations.antivirus).toEqual({ configured: true });
    const test = await admin.post('/api/integrations/antivirus/test').expect(200);
    expect(test.body).toEqual({ ok: true, version: VERSION, error: null });
    await ana.post('/api/integrations/antivirus/test').expect(403);
  });

  // Last: it stops the fake clamd.
  it('refuses files while the antivirus is down, rather than storing them unchecked', async () => {
    await clamd.close();
    const response = await ana
      .post(`/api/ideas/${number}/attachments`)
      .attach('file', Buffer.from('outro'), 'outra.txt')
      .expect(503);
    expect(response.body.code).toBe('ANTIVIRUS_UNAVAILABLE');
    const test = await admin.post('/api/integrations/antivirus/test').expect(200);
    expect(test.body.ok).toBe(false);
  });
});
