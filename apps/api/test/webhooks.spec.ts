import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { webhookBody } from '../src/webhooks/webhook-messages';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

/** Plays Slack, Teams and Google Chat: records what each path receives. */
async function startChat() {
  const received: { path: string; body: { text?: string } }[] = [];
  let failing = false;
  const server: Server = createServer((request, response) => {
    let data = '';
    request.on('data', (chunk) => (data += chunk));
    request.on('end', () => {
      if (failing) {
        response.writeHead(500).end();
        return;
      }
      received.push({ path: request.url!, body: JSON.parse(data) });
      response.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    received,
    fail: (value: boolean) => (failing = value),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('webhookBody', () => {
  const message = { text: 'Ideia <b> & cia', url: 'https://sim.test/ideas/1', linkLabel: 'Abrir' };

  it('escapes the text for Slack and Google Chat links', () => {
    expect(webhookBody('slack', message)).toEqual({
      text: 'Ideia &lt;b&gt; &amp; cia <https://sim.test/ideas/1|Abrir>',
    });
    expect(webhookBody('google_chat', message)).toEqual(webhookBody('slack', message));
  });

  it('sends an Adaptive Card to Teams', () => {
    const card = (webhookBody('teams', message) as Extract<
      ReturnType<typeof webhookBody>,
      { type: string }
    >)!.attachments[0]!;
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.body[0]!.text).toBe('Ideia <b> & cia');
    expect(card.content.actions[0]).toEqual({
      type: 'Action.OpenUrl',
      title: 'Abrir',
      url: 'https://sim.test/ideas/1',
    });
  });
});

describe('Webhooks', () => {
  let chat: Awaited<ReturnType<typeof startChat>>;
  let sim: TestApp;
  let webhooks: WebhooksService;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser;
  let ti: string;
  let values: Record<string, string>;

  const newIdea = async (title: string, extra: object = {}) =>
    (
      await ana
        .post('/api/ideas')
        .send({ title, categoryId: ti, values, publish: true, ...extra })
        .expect(201)
    ).body.number as number;
  const deliveries = async () =>
    (await sim.pool.query('select channel, status, attempts from webhook_deliveries')).rows;

  beforeAll(async () => {
    chat = await startChat();
    sim = await createApp({
      SIM_MODE: 'api', // the dispatcher is called directly
      REDIS_URL: inject('redisUrl'),
      SIM_PUBLIC_URL: 'http://sim.test',
      SIM_WEBHOOK_SLACK_URL: `${chat.url}/slack`,
      SIM_WEBHOOK_TEAMS_URL: `${chat.url}/teams`,
      SIM_WEBHOOK_GOOGLE_CHAT_URL: `${chat.url}/chat`,
    });
    webhooks = sim.app.get(WebhooksService);
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const reviewer = await createCollaborator(sim, admin, 'Bruno');
    bruno = reviewer.browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [reviewer.id] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  beforeEach(async () => {
    chat.fail(false);
    await webhooks.dispatchPending(new Date(Date.now() + 86_400_000));
    await sim.pool.query('delete from webhook_deliveries');
    chat.received.length = 0;
  });

  afterAll(async () => {
    await sim.close();
    await chat.close();
  });

  it('tells every channel about a new Idea, with the link and without its text', async () => {
    const number = await newIdea('Estacionamento para motos');
    expect(await webhooks.dispatchPending()).toBe(3);
    expect(await webhooks.dispatchPending()).toBe(0);

    expect(chat.received.map((r) => r.path).sort()).toEqual(['/chat', '/slack', '/teams']);
    const slack = chat.received.find((r) => r.path === '/slack')!.body.text!;
    expect(slack).toBe(
      `Nova Ideia em TI: #${number} Estacionamento para motos (por Ana) <http://sim.test/ideas/${number}|Abrir a Ideia>`,
    );
    expect(JSON.stringify(chat.received)).not.toContain('Texto');
    expect((await deliveries()).every((d) => d.status === 'sent')).toBe(true);
  });

  it('says nothing about Drafts until they are published', async () => {
    await ana
      .post('/api/ideas')
      .send({ title: 'Rascunho', categoryId: ti, values: {}, publish: false })
      .expect(201);
    expect(await deliveries()).toEqual([]);
  });

  it('tells about Status changes with the names the Administrator gave', async () => {
    const number = await newIdea('Café melhor');
    await webhooks.dispatchPending();
    chat.received.length = 0;
    await admin.put('/api/statuses/under_review').send({ label: 'No comitê' }).expect(200);

    await bruno
      .post(`/api/ideas/${number}/status`)
      .send({ to: 'under_review', justification: 'Vamos ver' })
      .expect(200);
    await webhooks.dispatchPending();
    expect(chat.received.find((r) => r.path === '/slack')!.body.text).toContain(
      `#${number} Café melhor passou de Aberta para No comitê`,
    );
    await admin.put('/api/statuses/under_review').send({ label: null }).expect(200);
  });

  it('keeps the Author hidden when they chose so', async () => {
    await admin.patch('/api/settings').send({ hiddenAuthorshipEnabled: true }).expect(200);
    await newIdea('Ideia discreta', { hiddenAuthorship: true });
    await webhooks.dispatchPending();
    const slack = chat.received.find((r) => r.path === '/slack')!.body.text!;
    expect(slack).toContain('(por Colaborador anônimo)');
    expect(slack).not.toContain('Ana');
  });

  it('tries again later when a channel fails', async () => {
    await newIdea('Ideia que falha');
    chat.fail(true);
    expect(await webhooks.dispatchPending()).toBe(0);
    expect((await deliveries()).map((d) => [d.status, d.attempts])).toEqual([
      ['pending', 1],
      ['pending', 1],
      ['pending', 1],
    ]);

    chat.fail(false);
    expect(await webhooks.dispatchPending()).toBe(0); // waits before the next attempt
    expect(await webhooks.dispatchPending(new Date(Date.now() + 120_000))).toBe(3);
  });

  it('shows the channels on the Integrations screen, never the URLs, and tests them', async () => {
    const { body } = await admin.get('/api/integrations').expect(200);
    expect(body.webhooks).toEqual({
      channels: ['slack', 'teams', 'google_chat'],
      events: ['published', 'status'],
    });
    expect(JSON.stringify(body)).not.toContain(chat.url);

    const test = await admin.post('/api/integrations/webhooks/test').expect(200);
    expect(test.body).toEqual([
      { channel: 'slack', ok: true, error: null },
      { channel: 'teams', ok: true, error: null },
      { channel: 'google_chat', ok: true, error: null },
    ]);
    expect(chat.received).toHaveLength(3);
    await ana.post('/api/integrations/webhooks/test').expect(403);
  });
});
