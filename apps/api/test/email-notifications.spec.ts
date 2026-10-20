import { inject } from 'vitest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  EmailDispatcher,
  MAX_EMAIL_ATTEMPTS,
} from '../src/notifications/email/email-dispatcher.service';
import { type MailMessage, Mailer } from '../src/notifications/email/mailer';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

class FakeMailer extends Mailer {
  sent: MailMessage[] = [];
  failing = false;
  async send(message: MailMessage) {
    if (this.failing) throw new Error('SMTP down');
    this.sent.push(message);
  }
}

describe('E-mail Notifications', () => {
  const mailer = new FakeMailer();
  let sim: TestApp;
  let dispatcher: EmailDispatcher;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser;
  let ids: { ana: string; bruno: string };
  let values: Record<string, string>;
  let ti: string;

  const dispatch = () => dispatcher.dispatchPending();
  const newIdea = async (title = 'Estacionamento para motos') =>
    (
      await ana
        .post('/api/ideas')
        .send({ title, categoryId: ti, values, publish: true })
        .expect(201)
    ).body.number as number;
  const emailStatuses = async () =>
    (await sim.pool.query('select email_status from notifications order by created_at')).rows.map(
      (row) => row.email_status,
    );

  beforeAll(async () => {
    sim = await createApp(
      {
        SIM_MODE: 'api', // the job itself is tested below; here the dispatcher is called directly
        SMTP_URL: 'smtp://localhost:2525',
        REDIS_URL: inject('redisUrl'),
      },
      { mailer },
    );
    dispatcher = sim.app.get(EmailDispatcher);
    admin = await signInAsAdministrator(sim);
    const a = await createCollaborator(sim, admin, 'Ana');
    const b = await createCollaborator(sim, admin, 'Bruno');
    [ana, bruno] = [a.browser, b.browser];
    ids = { ana: a.id, bruno: b.id };
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [ids.bruno] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  beforeEach(async () => {
    await dispatch();
    mailer.sent = [];
    mailer.failing = false;
  });

  afterAll(() => sim.close());

  it('sends an e-mail with the link to the Idea, and only once', async () => {
    const number = await newIdea();
    expect(await dispatch()).toBe(1);
    expect(await dispatch()).toBe(0);

    expect(mailer.sent).toHaveLength(1);
    const [email] = mailer.sent;
    expect(email!.to).toMatch(/^bruno/);
    expect(email!.subject).toContain('Estacionamento para motos');
    expect(email!.text).toContain(`http://localhost:3000/ideas/${number}`);
    expect(await emailStatuses()).toContain('sent');
  });

  it('carries the logo inline, when it is an image e-mail clients show', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await newIdea();
    await dispatch();
    expect(mailer.sent[0]!.attachments).toBeUndefined();
    expect(mailer.sent[0]!.html).not.toContain('<img');

    await admin.put('/api/branding/assets/logoDark').attach('file', png, 'logo.png').expect(200);
    mailer.sent = [];
    await newIdea();
    await dispatch();
    const [email] = mailer.sent;
    expect(email!.html).toContain('src="cid:logo@sim"');
    expect(email!.attachments).toEqual([
      { filename: 'logo.png', content: png, contentType: 'image/png', cid: 'logo@sim' },
    ]);

    // The light logo wins, but an SVG does not go into e-mails.
    await admin.put('/api/branding/assets/logoLight').attach('file', svg, 'logo.svg').expect(200);
    mailer.sent = [];
    await newIdea();
    await dispatch();
    expect(mailer.sent[0]!.attachments).toBeUndefined();

    await admin.delete('/api/branding/assets/logoLight').expect(200);
    await admin.delete('/api/branding/assets/logoDark').expect(200);
  });

  it('does not put Comment text in the e-mail', async () => {
    const number = await newIdea();
    await bruno.put(`/api/ideas/${number}/follow`).expect(200);
    await dispatch();
    mailer.sent = [];
    await ana
      .post(`/api/ideas/${number}/comments`)
      .send({ text: 'Texto confidencial do comentário' })
      .expect(201);
    await dispatch();
    expect(mailer.sent).toHaveLength(1);
    expect(JSON.stringify(mailer.sent)).not.toContain('confidencial');
  });

  it('respects the preference to not receive e-mail', async () => {
    const preferences = await bruno
      .put('/api/notifications/preferences')
      .send({ email: 'off' })
      .expect(200);
    expect(preferences.body).toEqual({ newComments: true, email: 'off', emailAvailable: true });

    await newIdea();
    expect(await dispatch()).toBe(0);
    expect(mailer.sent).toEqual([]);
    // The bell still has it.
    expect(
      (await bruno.get('/api/notifications/unread-count').expect(200)).body.unread,
    ).toBeGreaterThan(0);

    await bruno.put('/api/notifications/preferences').send({ email: 'instant' }).expect(200);
  });

  describe('daily summary', () => {
    const setMode = (who: Browser, email: string) =>
      who.put('/api/notifications/preferences').send({ email }).expect(200);

    it('holds the news and sends one e-mail with all of it', async () => {
      await setMode(bruno, 'daily');
      try {
        await newIdea('Primeira novidade');
        await newIdea('Segunda novidade');
        expect(await dispatch()).toBe(0); // nothing goes out as it happens
        expect(mailer.sent).toEqual([]);

        expect(await dispatcher.dispatchDigests()).toBe(1);
        expect(mailer.sent).toHaveLength(1);
        const [digest] = mailer.sent;
        expect(digest!.subject).toMatch(/Resumo do dia: 2 novidades/);
        expect(digest!.text).toContain('Primeira novidade');
        expect(digest!.text).toContain('Segunda novidade');
        expect(digest!.text).toContain('http://localhost:3000/ideas/');

        expect(await dispatcher.dispatchDigests()).toBe(0); // nothing left
      } finally {
        await setMode(bruno, 'instant');
      }
    });

    it('does not mix people: each one gets their own summary', async () => {
      await setMode(bruno, 'daily');
      await setMode(ana, 'daily');
      try {
        const number = await newIdea('Para o Bruno');
        await bruno.put(`/api/ideas/${number}/follow`).expect(200);
        await bruno
          .post(`/api/ideas/${number}/status`)
          .send({ to: 'under_review', justification: 'Analisando' })
          .expect(200);
        expect(await dispatcher.dispatchDigests()).toBe(2); // Bruno (new Idea) and Ana (status)
        expect(mailer.sent.map((m) => m.to).sort()).toEqual([
          'ana@company.test',
          'bruno@company.test',
        ]);
      } finally {
        await setMode(bruno, 'instant');
        await setMode(ana, 'instant');
      }
    });

    it('follows a change of mind: back to instant it goes out right away, off it is dropped', async () => {
      await setMode(bruno, 'daily');
      await newIdea('Muda de ideia');
      await setMode(bruno, 'instant');
      expect(await dispatcher.dispatchDigests()).toBe(0);
      expect(await dispatch()).toBe(1); // the digest row went back to the instant queue
      mailer.sent = [];

      await setMode(bruno, 'daily');
      await newIdea('Desiste');
      await setMode(bruno, 'off');
      expect(await dispatcher.dispatchDigests()).toBe(0);
      expect(await dispatch()).toBe(0);
      expect(mailer.sent).toEqual([]);
      await setMode(bruno, 'instant');
    });

    it('keeps the news for the next run when the SMTP fails', async () => {
      await setMode(bruno, 'daily');
      try {
        await newIdea('Falha no resumo');
        mailer.failing = true;
        expect(await dispatcher.dispatchDigests()).toBe(0);
        mailer.failing = false;
        expect(await dispatcher.dispatchDigests()).toBe(1);
        expect(mailer.sent[0]!.text).toContain('Falha no resumo');
      } finally {
        await setMode(bruno, 'instant');
      }
    });
  });

  // Pretends the waiting time passed.
  const retryNow = () => sim.pool.query('update notifications set email_retry_at = now()');

  it('waits before retrying, then gives up after the maximum number of attempts', async () => {
    await newIdea();
    mailer.failing = true;
    await dispatch();
    expect((await emailStatuses()).at(-1)).toBe('pending');

    // Still waiting: even with the SMTP back, nothing is sent yet.
    mailer.failing = false;
    expect(await dispatch()).toBe(0);
    expect(mailer.sent).toEqual([]);

    mailer.failing = true;
    for (let attempt = 2; attempt < MAX_EMAIL_ATTEMPTS; attempt += 1) {
      await retryNow();
      await dispatch();
      expect((await emailStatuses()).at(-1)).toBe('pending');
    }
    await retryNow();
    await dispatch();
    expect((await emailStatuses()).at(-1)).toBe('failed');

    mailer.failing = false;
    await retryNow();
    expect(await dispatch()).toBe(0);
  });

  it('sends after the waiting time when the SMTP is back', async () => {
    await newIdea();
    mailer.failing = true;
    await dispatch();
    mailer.failing = false;
    await retryNow();
    expect(await dispatch()).toBe(1);
    expect((await emailStatuses()).at(-1)).toBe('sent');
  });

  it('delivers through the BullMQ job in worker mode', async () => {
    const worker = new FakeMailer();
    const other = await createApp(
      {
        SIM_MODE: 'all',
        SMTP_URL: 'smtp://localhost:2525',
        REDIS_URL: inject('redisUrl'),
      },
      { mailer: worker },
    );
    try {
      const adminBrowser = await signInAsAdministrator(other);
      const author = await createCollaborator(other, adminBrowser, 'Carla');
      await adminBrowser
        .post('/api/categories')
        .send({ name: 'Geral' })
        .expect(201)
        .then(async ({ body }) => {
          const fields = (await author.browser.get('/api/custom-fields').expect(200)).body as {
            id: string;
            required: boolean;
          }[];
          await author.browser
            .post('/api/ideas')
            .send({
              title: 'Ideia pelo worker',
              categoryId: body.id,
              values: Object.fromEntries(
                fields.filter((f) => f.required).map((f) => [f.id, 'Texto']),
              ),
              publish: true,
            })
            .expect(201);
        });
      await expect.poll(() => worker.sent.length, { timeout: 30_000, interval: 500 }).toBe(1);
      expect(worker.sent[0]!.subject).toContain('Ideia pelo worker');
    } finally {
      await other.close();
    }
  });
});
