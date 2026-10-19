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
      .send({ byEmail: false })
      .expect(200);
    expect(preferences.body).toEqual({ newComments: true, byEmail: false, emailAvailable: true });

    await newIdea();
    expect(await dispatch()).toBe(0);
    expect(mailer.sent).toEqual([]);
    // The bell still has it.
    expect(
      (await bruno.get('/api/notifications/unread-count').expect(200)).body.unread,
    ).toBeGreaterThan(0);

    await bruno.put('/api/notifications/preferences').send({ byEmail: true }).expect(200);
  });

  it('retries failures and gives up after the maximum number of attempts', async () => {
    await newIdea();
    mailer.failing = true;
    for (let attempt = 1; attempt < MAX_EMAIL_ATTEMPTS; attempt += 1) {
      await dispatch();
      expect((await emailStatuses()).at(-1)).toBe('pending');
    }
    await dispatch();
    expect((await emailStatuses()).at(-1)).toBe('failed');

    mailer.failing = false;
    expect(await dispatch()).toBe(0);
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
