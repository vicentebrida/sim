import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  EMERGENCY,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

interface Received {
  type: string;
  data: Record<string, unknown>;
}

/** Opens /api/events like the browser's EventSource and collects the events. */
async function openStream(baseUrl: string, cookie: string) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/events`, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: controller.signal,
  });
  const received: Received[] = [];
  let ended = false;
  if (response.ok) {
    void (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for await (const chunk of response.body!) {
          buffer += decoder.decode(chunk as Uint8Array, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const type = /^event: (.+)$/m.exec(frame)?.[1] ?? 'message';
            const data = /^data: (.*)$/m.exec(frame)?.[1];
            received.push({ type, data: data ? JSON.parse(data) : {} });
          }
        }
      } catch {
        // Aborted by the test.
      }
      ended = true;
    })();
  }

  /** Waits for an event matching `match` and returns the events that arrived. */
  const waitFor = async (match: (event: Received) => boolean, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (received.some(match)) return received;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`event not received; got ${JSON.stringify(received)}`);
  };

  return {
    response,
    received,
    waitFor,
    ended: () => ended,
    close: () => controller.abort(),
  };
}

async function cookieOf(baseUrl: string, email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return response.headers.getSetCookie()[0]!.split(';')[0]!;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe('Real time (SSE)', () => {
  let sim: TestApp;
  let baseUrl: string;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser;
  let anaCookie: string;
  let brunoCookie: string;
  let ti: string;
  let values: Record<string, string>;
  const streams: { close: () => void }[] = [];

  const open = async (cookie: string) => {
    const stream = await openStream(baseUrl, cookie);
    streams.push(stream);
    // The stream is subscribed once the headers arrive; give the listener a moment.
    await settle();
    return stream;
  };

  const newIdea = async (publish = true) =>
    (
      await ana
        .post('/api/ideas')
        .send({ title: 'Ideia ao vivo', categoryId: ti, values, publish })
        .expect(201)
    ).body.number as number;

  beforeAll(async () => {
    sim = await createApp({}, { heartbeatMs: 200 });
    await sim.app.listen(0, '127.0.0.1');
    baseUrl = (await sim.app.getUrl()).replace('[::1]', '127.0.0.1');
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    bruno = (await createCollaborator(sim, admin, 'Bruno')).browser;
    anaCookie = await cookieOf(baseUrl, 'ana@company.test', 'password-of-Ana-123');
    brunoCookie = await cookieOf(baseUrl, 'bruno@company.test', 'password-of-Bruno-123');
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(async () => {
    for (const stream of streams) stream.close();
    await sim.close();
  });

  it('requires a session', async () => {
    const response = await fetch(`${baseUrl}/api/events`);
    expect(response.status).toBe(401);
  });

  it('tells everyone which Idea changed, and only the recipient about the bell', async () => {
    const number = await newIdea();
    const anaStream = await open(anaCookie);
    const brunoStream = await open(brunoCookie);
    expect(anaStream.response.headers.get('content-type')).toContain('text/event-stream');

    await bruno.post(`/api/ideas/${number}/comments`).send({ text: 'Boa ideia!' }).expect(201);

    const isIdea = (event: Received) => event.type === 'idea' && event.data.number === number;
    await anaStream.waitFor((event) => event.type === 'notifications');
    await anaStream.waitFor(isIdea);
    await brunoStream.waitFor(isIdea);
    // The events say what changed, never the content.
    expect(JSON.stringify(anaStream.received)).not.toContain('Boa ideia');
    expect(brunoStream.received.some((event) => event.type === 'notifications')).toBe(false);

    anaStream.received.length = 0;
    await ana.post('/api/notifications/read-all').expect(204);
    await anaStream.waitFor((event) => event.type === 'notifications');
  });

  it('does not announce Drafts', async () => {
    const stream = await open(brunoCookie);
    const draft = await newIdea(false);
    await ana.patch(`/api/ideas/${draft}`).send({ title: 'Rascunho mudou' }).expect(200);
    const published = await newIdea();
    await bruno.put(`/api/ideas/${published}/like`).expect(200);

    await stream.waitFor((event) => event.type === 'idea' && event.data.number === published);
    expect(stream.received.some((event) => event.data.number === draft)).toBe(false);
  });

  it('asks the browsers to fetch again after the database connection comes back', async () => {
    const stream = await open(anaCookie);
    await sim.pool.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where query = 'LISTEN sim_events' and datname = current_database()`,
    );
    await stream.waitFor((event) => event.type === 'resync', 10_000);

    // And it listens again.
    const number = await newIdea();
    await bruno.put(`/api/ideas/${number}/like`).expect(200);
    await stream.waitFor((event) => event.type === 'idea' && event.data.number === number);
  });

  it('pings, and ends the stream when the session ends', async () => {
    const cookie = await cookieOf(baseUrl, EMERGENCY.email, EMERGENCY.password);
    const stream = await open(cookie);
    await stream.waitFor((event) => event.type === 'ping');

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(logout.status).toBe(204);
    const deadline = Date.now() + 3_000;
    while (!stream.ended() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(stream.ended()).toBe(true);
  });
});
