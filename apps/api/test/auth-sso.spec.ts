import { OAuth2Server } from 'oauth2-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readGroups } from '../src/auth/sso/sso.service';
import { type Browser, createApp, EMERGENCY, type TestApp } from './support/app';

type Claims = Record<string, unknown>;

/** Fake identity provider; each test decides who is "signed in" there. */
async function startProvider() {
  const provider = new OAuth2Server();
  await provider.issuer.keys.generate('RS256');
  await provider.start(0, '127.0.0.1');
  let idToken: Claims = {};
  let userinfo: Claims = {};
  provider.service.on('beforeTokenSigning', (token) => Object.assign(token.payload, idToken));
  provider.service.on('beforeUserinfo', (response) => {
    response.body = userinfo;
  });
  return {
    provider,
    url: provider.issuer.url!,
    identity(claims: { idToken?: Claims; userinfo?: Claims }) {
      idToken = claims.idToken ?? {};
      userinfo = claims.userinfo ?? {};
    },
  };
}

/** Walks the browser path: SIM → provider → back to SIM. Returns the final destination. */
async function signInWithSso(browser: Browser, returnTo = '/') {
  const start = await browser.get('/api/auth/sso/start').query({ returnTo }).expect(302);
  const atProvider = await fetch(start.headers.location!, { redirect: 'manual' });
  const back = new URL(atProvider.headers.get('location')!);
  const final = await browser.get(back.pathname + back.search).expect(302);
  return final.headers.location as string;
}

describe('SSO in OIDC mode', () => {
  let sim: TestApp;
  let idp: Awaited<ReturnType<typeof startProvider>>;

  beforeAll(async () => {
    idp = await startProvider();
    sim = await createApp({
      SIM_SSO_MODE: 'oidc',
      SIM_SSO_ISSUER: idp.url,
      SIM_SSO_CLIENT_ID: 'sim',
      SIM_SSO_CLIENT_SECRET: 'secret',
      SIM_SSO_CLAIM_DEPARTMENT: 'department',
      SIM_SSO_BUTTON_LABEL: 'Entrar com a conta Acme',
      SIM_ADMIN_EMAILS: 'director@acme.test',
    });
  });

  afterAll(async () => {
    await sim.close();
    await idp.provider.stop();
  });

  beforeEach(() => {
    const claims = {
      sub: 'emp-001',
      email: 'Maria@Acme.test',
      name: 'Maria Silva',
      department: 'Financeiro',
    };
    idp.identity({ idToken: claims, userinfo: claims });
  });

  it('announces the SSO button to the web app', async () => {
    const response = await sim.http().get('/api/auth/configuration').expect(200);
    expect(response.body.sso).toEqual({ enabled: true, label: 'Entrar com a conta Acme' });
  });

  it('creates the Collaborator on first login and goes back to the requested page', async () => {
    const browser = sim.browser();
    expect(await signInWithSso(browser, '/ideas/123')).toBe('/ideas/123');

    const me = await browser.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      name: 'Maria Silva',
      email: 'maria@acme.test',
      department: 'Financeiro',
      administrator: false,
      mustChangePassword: false,
    });
  });

  it('refreshes the Collaborator data on each login, without duplicating it', async () => {
    await signInWithSso(sim.browser());
    idp.identity({
      idToken: { sub: 'emp-001', email: 'maria@acme.test', name: 'Maria S. Souza' },
      userinfo: { sub: 'emp-001', email: 'maria@acme.test', name: 'Maria S. Souza' },
    });
    const browser = sim.browser();
    await signInWithSso(browser);

    const me = await browser.get('/api/auth/me').expect(200);
    expect(me.body.name).toBe('Maria S. Souza');
    const { rows } = await sim.pool.query(
      `select 1 from collaborators where sso_subject = 'emp-001'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('promotes whoever is in SIM_ADMIN_EMAILS to Administrator', async () => {
    const claims = { sub: 'emp-002', email: 'director@acme.test', name: 'Director' };
    idp.identity({ idToken: claims, userinfo: claims });
    const browser = sim.browser();
    await signInWithSso(browser);
    const me = await browser.get('/api/auth/me').expect(200);
    expect(me.body.administrator).toBe(true);
  });

  it('links to the local Collaborator that already had the same e-mail', async () => {
    const admin = sim.browser();
    await admin
      .post('/api/auth/login')
      .send({ email: EMERGENCY.email, password: EMERGENCY.password });
    const created = await admin
      .post('/api/collaborators')
      .send({ name: 'João', email: 'joao@acme.test' })
      .expect(201);

    const claims = { sub: 'emp-003', email: 'joao@acme.test', name: 'João Pereira' };
    idp.identity({ idToken: claims, userinfo: claims });
    const browser = sim.browser();
    await signInWithSso(browser);

    const me = await browser.get('/api/auth/me').expect(200);
    expect(me.body.id).toBe(created.body.collaborator.id);
  });

  it('does not redirect outside SIM after login', async () => {
    expect(await signInWithSso(sim.browser(), '//malicious.test')).toBe('/');
    expect(await signInWithSso(sim.browser(), 'https://malicious.test')).toBe('/');
  });

  it('rejects a callback without the transaction started by SIM', async () => {
    const response = await sim
      .http()
      .get('/api/auth/sso/callback?code=anything&state=forged')
      .expect(302);
    expect(response.headers.location).toBe('/login?error=sso');
  });

  it('does not let an inactive Collaborator in', async () => {
    await signInWithSso(sim.browser());
    await sim.pool.query(`update collaborators set active = false where sso_subject = 'emp-001'`);
    expect(await signInWithSso(sim.browser())).toBe('/login?error=inactive');
  });
});

describe('SSO in generic OAuth2 mode', () => {
  let sim: TestApp;
  let idp: Awaited<ReturnType<typeof startProvider>>;

  beforeAll(async () => {
    idp = await startProvider();
    sim = await createApp({
      SIM_SSO_MODE: 'oauth2',
      SIM_SSO_CLIENT_ID: 'sim',
      SIM_SSO_CLIENT_SECRET: 'secret',
      SIM_SSO_TOKEN_AUTH_METHOD: 'client_secret_post',
      SIM_SSO_AUTHORIZATION_URL: `${idp.url}/authorize`,
      SIM_SSO_TOKEN_URL: `${idp.url}/token`,
      SIM_SSO_USERINFO_URL: `${idp.url}/userinfo`,
      SIM_SSO_SCOPES: 'profile',
      // Corporate provider with its own field names and a nested department.
      SIM_SSO_CLAIM_ID: 'id',
      SIM_SSO_CLAIM_EMAIL: 'mail',
      SIM_SSO_CLAIM_NAME: 'displayName',
      SIM_SSO_CLAIM_DEPARTMENT: 'org.unit',
    });
  });

  afterAll(async () => {
    await sim.close();
    await idp.provider.stop();
  });

  it('reads the identity from userinfo using the field mapping', async () => {
    idp.identity({
      userinfo: {
        id: 48151623,
        mail: 'pedro@acme.test',
        displayName: 'Pedro Santos',
        org: { unit: 'Logística' },
      },
    });
    const browser = sim.browser();
    expect(await signInWithSso(browser)).toBe('/');

    const me = await browser.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      name: 'Pedro Santos',
      email: 'pedro@acme.test',
      department: 'Logística',
    });
  });

  it('fails gracefully when the provider does not send the e-mail', async () => {
    idp.identity({ userinfo: { id: 1, displayName: 'No E-mail' } });
    expect(await signInWithSso(sim.browser())).toBe('/login?error=sso');
  });
});

describe('readGroups', () => {
  it('accepts a list, a text separated by commas or spaces, and nested claims', () => {
    expect(readGroups({ groups: ['a', 'b'] }, 'groups')).toEqual(['a', 'b']);
    expect(readGroups({ groups: 'a, b  c' }, 'groups')).toEqual(['a', 'b', 'c']);
    expect(readGroups({ realm: { roles: ['x'] } }, 'realm.roles')).toEqual(['x']);
    expect(readGroups({}, 'groups')).toEqual([]);
    expect(readGroups({ groups: 7 }, 'groups')).toEqual([]);
  });
});

describe('SSO groups', () => {
  let sim: TestApp;
  let idp: Awaited<ReturnType<typeof startProvider>>;

  const login = (sub: string, groups?: unknown) => {
    const claims = { sub, email: `${sub}@acme.test`, name: sub, groups };
    idp.identity({ idToken: claims, userinfo: claims });
    const browser = sim.browser();
    return signInWithSso(browser).then((destination) => ({ browser, destination }));
  };

  beforeAll(async () => {
    idp = await startProvider();
    sim = await createApp({
      SIM_SSO_MODE: 'oidc',
      SIM_SSO_ISSUER: idp.url,
      SIM_SSO_CLIENT_ID: 'sim',
      SIM_SSO_CLIENT_SECRET: 'secret',
      SIM_ACCESS_GROUP: 'sim-users',
      SIM_ADMIN_GROUP: 'sim-admins',
      SIM_ADMIN_EMAILS: 'boss@acme.test',
    });
  });

  afterAll(async () => {
    await sim.close();
    await idp.provider.stop();
  });

  it('lets in only members of the access group', async () => {
    expect((await login('ana', ['sim-users'])).destination).toBe('/');
    expect((await login('bruno', ['other'])).destination).toBe('/login?error=group');
    expect((await login('carla')).destination).toBe('/login?error=group');
    const { rows } = await sim.pool.query(
      `select 1 from collaborators where sso_subject = 'bruno'`,
    );
    expect(rows).toHaveLength(0); // no account is created for who is kept out
  });

  it('makes members of the admin group Administrators, and follows the provider afterwards', async () => {
    const first = await login('davi', ['sim-users', 'sim-admins']);
    expect((await first.browser.get('/api/auth/me')).body.administrator).toBe(true);

    const later = await login('davi', ['sim-users']);
    expect((await later.browser.get('/api/auth/me')).body.administrator).toBe(false);
  });

  it('keeps the SIM_ADMIN_EMAILS list working next to the admin group', async () => {
    const { browser } = await login('boss', ['sim-users']);
    expect((await browser.get('/api/auth/me')).body.administrator).toBe(true);
  });
});
