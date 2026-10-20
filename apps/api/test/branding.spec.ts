import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectBrandingImage } from '../src/attachments/domain/file-type';
import { renderDigest, renderEmail } from '../src/notifications/email/email-templates';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const SVG = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const ICO = Buffer.from('00000100010010100000', 'hex');

describe('detectBrandingImage', () => {
  it('accepts the identity image types by content', () => {
    expect(detectBrandingImage(PNG)).toBe('image/png');
    expect(detectBrandingImage(SVG)).toBe('image/svg+xml');
    expect(detectBrandingImage(ICO)).toBe('image/x-icon');
  });

  it('refuses anything else', () => {
    expect(detectBrandingImage(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectBrandingImage(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectBrandingImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('e-mail with the identity', () => {
  const context = {
    locale: 'en' as const,
    type: 'comment' as const,
    recipientName: 'Ana',
    actorName: 'Bruno',
    ideaNumber: 1,
    ideaTitle: 'Ideia',
    data: {},
    url: 'https://sim.example.com/ideas/1',
  };

  it('uses the installation name and color', () => {
    const email = renderEmail({ ...context, brand: { name: 'Acme Ideias', color: '#ffee00' } });
    expect(email.subject).toMatch(/^\[Acme Ideias\] /);
    expect(email.html).toContain('background:#ffee00;color:#111111');
    expect(renderEmail({ ...context, brand: { name: 'X', color: '#102030' } }).html).toContain(
      'color:#ffffff',
    );
  });

  it('puts the logo on top of the e-mail and of the daily summary', () => {
    const brand = { name: 'Acme', color: null, logo: true };
    expect(renderEmail({ ...context, brand }).html).toMatch(
      /^<p><img src="cid:logo@sim" alt="Acme"/,
    );
    expect(renderDigest({ ...context, brand, items: [context] }).html).toContain('cid:logo@sim');
    expect(renderEmail({ ...context, brand: { ...brand, logo: false } }).html).not.toContain(
      '<img',
    );
  });
});

describe('Branding', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
  });

  afterAll(() => sim.close());

  it('starts with the SIM defaults, readable before login', async () => {
    const { body } = await sim.http().get('/api/branding').expect(200);
    expect(body).toEqual({
      name: 'SIM',
      primaryColor: null,
      loginTitle: '',
      loginText: '',
      logoLight: null,
      logoDark: null,
      favicon: null,
      loginImage: null,
    });
  });

  it('only Administrators change it', async () => {
    await ana.patch('/api/branding').send({ name: 'Outro' }).expect(403);
    await ana.put('/api/branding/assets/logoLight').attach('file', PNG, 'a.png').expect(403);
    await ana.delete('/api/branding/assets/logoLight').expect(403);
  });

  it('edits the name, color and login texts, validating them', async () => {
    const { body } = await admin
      .patch('/api/branding')
      .send({
        name: 'Acme Ideias',
        primaryColor: '#0a7d5a',
        loginTitle: 'Bem-vindo',
        loginText: 'Compartilhe suas ideias.',
      })
      .expect(200);
    expect(body).toMatchObject({ name: 'Acme Ideias', primaryColor: '#0a7d5a' });
    expect((await sim.http().get('/api/branding').expect(200)).body.loginTitle).toBe('Bem-vindo');

    await admin.patch('/api/branding').send({ primaryColor: 'verde' }).expect(400);
    await admin.patch('/api/branding').send({ name: '   ' }).expect(400);
    await admin.patch('/api/branding').send({ primaryColor: null }).expect(200);
  });

  it('stores images, serves them without login, and replaces or removes them', async () => {
    const first = await admin
      .put('/api/branding/assets/logoLight')
      .attach('file', PNG, 'logo.png')
      .expect(200);
    expect(first.body.logoLight).toMatch(/^\/api\/branding\/assets\/logoLight\?v=\d+$/);
    expect(first.body.logoDark).toBeNull();

    const image = await sim.http().get('/api/branding/assets/logoLight').expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(Buffer.from(image.body)).toEqual(PNG);
    expect(image.headers['content-security-policy']).toContain('sandbox');

    await admin.put('/api/branding/assets/logoLight').attach('file', SVG, 'logo.svg').expect(200);
    expect((await sim.http().get('/api/branding/assets/logoLight')).headers['content-type']).toBe(
      'image/svg+xml',
    );

    const removed = await admin.delete('/api/branding/assets/logoLight').expect(200);
    expect(removed.body.logoLight).toBeNull();
    await sim.http().get('/api/branding/assets/logoLight').expect(404);
  });

  it('refuses images that are not images, and unknown kinds', async () => {
    const refused = await admin
      .put('/api/branding/assets/favicon')
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'x.svg')
      .expect(400);
    expect(refused.body.code).toBe('IMAGE_NOT_ALLOWED');
    await admin.put('/api/branding/assets/outra').attach('file', PNG, 'a.png').expect(400);
    await admin.put('/api/branding/assets/favicon').expect(400);
    await sim.http().get('/api/branding/assets/outra').expect(400);
  });
});
