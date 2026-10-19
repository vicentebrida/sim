import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, EMERGENCY, type TestApp } from './support/app';

describe('local account authentication', () => {
  let sim: TestApp;

  beforeAll(async () => {
    sim = await createApp({ SIM_ADMIN_EMAILS: 'boss@company.test' });
  });

  afterAll(() => sim.close());

  async function signInAsEmergency() {
    const browser = sim.browser();
    await browser
      .post('/api/auth/login')
      .send({ email: EMERGENCY.email, password: EMERGENCY.password })
      .expect(200);
    return browser;
  }

  async function createAccount(data: { name: string; email: string; administrator?: boolean }) {
    const admin = await signInAsEmergency();
    const response = await admin.post('/api/collaborators').send(data).expect(201);
    return response.body as { collaborator: { id: string }; temporaryPassword: string };
  }

  it('requires a session on protected routes', async () => {
    await sim.http().get('/api/auth/me').expect(401);
  });

  it('the emergency account signs in as Administrator', async () => {
    const browser = await signInAsEmergency();
    const me = await browser.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      email: EMERGENCY.email,
      administrator: true,
      mustChangePassword: false,
    });
  });

  it('answers the same for an unknown e-mail and a wrong password', async () => {
    const wrongPassword = await sim
      .http()
      .post('/api/auth/login')
      .send({ email: EMERGENCY.email, password: 'wrong' })
      .expect(401);
    const unknownEmail = await sim
      .http()
      .post('/api/auth/login')
      .send({ email: 'nobody@company.test', password: 'wrong' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('a Collaborator with a temporary password only reaches what is needed until changing it', async () => {
    const { temporaryPassword } = await createAccount({ name: 'Ana', email: 'Ana@Company.test' });

    const ana = sim.browser();
    const login = await ana
      .post('/api/auth/login')
      .send({ email: 'ana@company.test', password: temporaryPassword })
      .expect(200);
    expect(login.body).toMatchObject({ email: 'ana@company.test', mustChangePassword: true });

    const blocked = await ana.get('/api/collaborators').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    await ana
      .post('/api/auth/change-password')
      .send({ currentPassword: temporaryPassword, newPassword: 'short' })
      .expect(400);
    await ana
      .post('/api/auth/change-password')
      .send({ currentPassword: temporaryPassword, newPassword: 'a-really-long-password' })
      .expect(204);

    const me = await ana.get('/api/auth/me').expect(200);
    expect(me.body.mustChangePassword).toBe(false);
    // Ana is not an Administrator: the route now answers 403 for the role, not the password.
    const noRole = await ana.get('/api/collaborators').expect(403);
    expect(noRole.body.code).toBeUndefined();

    await sim
      .http()
      .post('/api/auth/login')
      .send({ email: 'ana@company.test', password: 'a-really-long-password' })
      .expect(200);
  });

  it('changing the password ends the Collaborator other sessions', async () => {
    const { temporaryPassword } = await createAccount({
      name: 'Bruno',
      email: 'bruno@company.test',
    });
    const credentials = { email: 'bruno@company.test', password: temporaryPassword };
    const laptop = sim.browser();
    const phone = sim.browser();
    await laptop.post('/api/auth/login').send(credentials).expect(200);
    await phone.post('/api/auth/login').send(credentials).expect(200);

    await laptop
      .post('/api/auth/change-password')
      .send({ currentPassword: temporaryPassword, newPassword: 'another-long-password' })
      .expect(204);

    await laptop.get('/api/auth/me').expect(200);
    await phone.get('/api/auth/me').expect(401);
  });

  it('does not allow a duplicate e-mail', async () => {
    await createAccount({ name: 'Carla', email: 'carla@company.test' });
    const admin = await signInAsEmergency();
    const { body } = await admin
      .post('/api/collaborators')
      .send({ name: 'Carla 2', email: 'CARLA@company.test' })
      .expect(409);
    expect(body.code).toBe('EMAIL_TAKEN');
  });

  it('an e-mail listed in SIM_ADMIN_EMAILS is born an Administrator', async () => {
    const { collaborator } = await createAccount({ name: 'Boss', email: 'boss@company.test' });
    expect(collaborator).toMatchObject({ administrator: true });
  });

  it('an inactive Collaborator cannot sign in nor use open sessions', async () => {
    const { temporaryPassword } = await createAccount({ name: 'Davi', email: 'davi@company.test' });
    const davi = sim.browser();
    await davi
      .post('/api/auth/login')
      .send({ email: 'davi@company.test', password: temporaryPassword })
      .expect(200);

    await sim.pool.query(`update collaborators set active = false where email = $1`, [
      'davi@company.test',
    ]);

    await davi.get('/api/auth/me').expect(401);
    await sim
      .http()
      .post('/api/auth/login')
      .send({ email: 'davi@company.test', password: temporaryPassword })
      .expect(401);
  });

  it('logout ends the session', async () => {
    const browser = await signInAsEmergency();
    await browser.post('/api/auth/logout').expect(204);
    await browser.get('/api/auth/me').expect(401);
  });

  it('the emergency account password cannot be changed through the API', async () => {
    const browser = await signInAsEmergency();
    const { body } = await browser
      .post('/api/auth/change-password')
      .send({ currentPassword: EMERGENCY.password, newPassword: 'new-long-password' })
      .expect(400);
    expect(body.code).toBe('EMERGENCY_PASSWORD_FROM_ENV');
  });

  it('tells the web app which login methods are available', async () => {
    const response = await sim.http().get('/api/auth/configuration').expect(200);
    expect(response.body).toMatchObject({
      localLogin: true,
      sso: { enabled: false, label: null },
      attachments: { maxBytes: 10 * 1024 * 1024, maxCount: 5 },
    });
    expect(response.body.attachments.extensions).toContain('pdf');
  });

  it('locks repeated password guesses on one account, without affecting others', async () => {
    const target = { email: 'target@company.test', password: 'guess' };
    for (let attempt = 0; attempt < 10; attempt++) {
      await sim.http().post('/api/auth/login').send(target).expect(401);
    }
    const locked = await sim.http().post('/api/auth/login').send(target).expect(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');

    // Another account, from the same IP, can still sign in.
    await sim
      .http()
      .post('/api/auth/login')
      .send({ email: EMERGENCY.email, password: EMERGENCY.password })
      .expect(200);
  });
});
