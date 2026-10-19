import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanFilename, detectFileType } from '../src/attachments/domain/file-type';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n');
const ZIP = Buffer.from('504b0304140000000800', 'hex');

describe('detectFileType', () => {
  it('accepts the allowed types when the content agrees with the extension', () => {
    expect(detectFileType('foto.PNG', PNG)).toEqual({ contentType: 'image/png', image: true });
    expect(detectFileType('plano.pdf', PDF)?.image).toBe(false);
    expect(detectFileType('planilha.xlsx', ZIP)?.contentType).toContain('spreadsheetml');
    expect(detectFileType('nota.txt', Buffer.from('olá'))?.contentType).toContain('text/plain');
  });

  it('refuses other extensions, disguised files and empty files', () => {
    expect(detectFileType('programa.exe', Buffer.from('MZ'))).toBeNull();
    expect(detectFileType('pagina.html', Buffer.from('<script>'))).toBeNull();
    expect(detectFileType('desenho.svg', Buffer.from('<svg>'))).toBeNull();
    expect(detectFileType('falso.png', PDF)).toBeNull();
    expect(detectFileType('falso.txt', PNG)).toBeNull();
    expect(detectFileType('vazio.png', Buffer.alloc(0))).toBeNull();
  });

  it('cleans the file name', () => {
    expect(cleanFilename('../../etc/passwd')).toBe('passwd');
    expect(cleanFilename('C:\\docs\\a"b.pdf')).toBe('ab.pdf');
    expect(cleanFilename('')).toBe('file');
  });
});

describe('Attachments', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let bruno: Browser;
  let carla: Browser;
  let ti: string;
  let values: Record<string, string>;

  const newIdea = async (data: Record<string, unknown> = {}) =>
    (
      await ana
        .post('/api/ideas')
        .send({ title: 'Com anexos', categoryId: ti, values, publish: true, ...data })
        .expect(201)
    ).body.number as number;
  const upload = (who: Browser, url: string, data = PNG, name = 'foto.png') =>
    who.post(url).attach('file', data, name);

  beforeAll(async () => {
    sim = await createApp({ SIM_ATTACHMENT_MAX_MB: '1', SIM_ATTACHMENT_MAX_COUNT: '2' });
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const brunoAccount = await createCollaborator(sim, admin, 'Bruno');
    bruno = brunoAccount.browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [brunoAccount.id] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(() => sim.close());

  describe('on an Idea', () => {
    it('the Author sends a file, everyone who sees the Idea downloads it', async () => {
      const number = await newIdea();
      const { body } = await upload(ana, `/api/ideas/${number}/attachments`).expect(201);
      expect(body).toMatchObject({
        filename: 'foto.png',
        contentType: 'image/png',
        size: PNG.length,
        image: true,
      });

      const detail = (await carla.get(`/api/ideas/${number}`).expect(200)).body;
      expect(detail.attachments).toEqual([body]);

      const file = await carla.get(`/api/attachments/${body.id}`).expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['content-disposition']).toContain('inline');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(file.body)).toEqual(PNG);
    });

    it('documents download as attachments, never rendered', async () => {
      const number = await newIdea();
      const { body } = await upload(
        ana,
        `/api/ideas/${number}/attachments`,
        PDF,
        'plano.pdf',
      ).expect(201);
      const file = await ana.get(`/api/attachments/${body.id}`).expect(200);
      expect(file.headers['content-disposition']).toContain('attachment');
      expect(body.image).toBe(false);
    });

    it('requires login, and a Draft file is only for its Author', async () => {
      const draft = (
        await ana.post('/api/ideas').send({ title: 'Rascunho', categoryId: ti }).expect(201)
      ).body.number as number;
      const { body } = await upload(ana, `/api/ideas/${draft}/attachments`).expect(201);
      await sim.http().get(`/api/attachments/${body.id}`).expect(401);
      await carla.get(`/api/attachments/${body.id}`).expect(404);
      await ana.get(`/api/attachments/${body.id}`).expect(200);
    });

    it('only the Author adds and deletes, while the Idea can be edited', async () => {
      const number = await newIdea();
      await upload(bruno, `/api/ideas/${number}/attachments`).expect(403);
      const { body } = await upload(ana, `/api/ideas/${number}/attachments`).expect(201);
      await bruno.delete(`/api/attachments/${body.id}`).expect(403);

      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'Analisando' })
        .expect(200);
      await upload(ana, `/api/ideas/${number}/attachments`).expect(409);
      await ana.delete(`/api/attachments/${body.id}`).expect(409);
    });

    it('deleting removes it from the Idea and from the disk', async () => {
      const number = await newIdea();
      const { body } = await upload(ana, `/api/ideas/${number}/attachments`).expect(201);
      await ana.delete(`/api/attachments/${body.id}`).expect(204);
      await ana.get(`/api/attachments/${body.id}`).expect(404);
      expect((await ana.get(`/api/ideas/${number}`).expect(200)).body.attachments).toEqual([]);
    });

    it('deleting the Idea deletes its files', async () => {
      const draft = (
        await ana.post('/api/ideas').send({ title: 'Para apagar', categoryId: ti }).expect(201)
      ).body.number as number;
      const { body } = await upload(ana, `/api/ideas/${draft}/attachments`).expect(201);
      await ana.delete(`/api/ideas/${draft}`).expect(204);
      await ana.get(`/api/attachments/${body.id}`).expect(404);
    });
  });

  describe('rules', () => {
    it('refuses types that are not allowed, disguised files and missing files', async () => {
      const number = await newIdea();
      const url = `/api/ideas/${number}/attachments`;
      const refused = await upload(ana, url, Buffer.from('MZ'), 'virus.exe').expect(400);
      expect(refused.body.code).toBe('ATTACHMENT_TYPE_NOT_ALLOWED');
      await upload(ana, url, PDF, 'falso.png').expect(400);
      expect((await ana.post(url).expect(400)).body.code).toBe('FILE_REQUIRED');
    });

    it('refuses files over the size limit', async () => {
      const number = await newIdea();
      const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
      const response = await upload(ana, `/api/ideas/${number}/attachments`, big).expect(413);
      expect(response.body.code).toBe('ATTACHMENT_TOO_LARGE');
    });

    it('limits how many files an item has', async () => {
      const number = await newIdea();
      const url = `/api/ideas/${number}/attachments`;
      await upload(ana, url).expect(201);
      await upload(ana, url).expect(201);
      expect((await upload(ana, url).expect(409)).body.code).toBe('TOO_MANY_ATTACHMENTS');
    });
  });

  describe('on a Comment', () => {
    it('the writer attaches files, others download them', async () => {
      const number = await newIdea();
      const comment = (
        await carla.post(`/api/ideas/${number}/comments`).send({ text: 'Veja' }).expect(201)
      ).body;
      const { body } = await upload(carla, `/api/comments/${comment.id}/attachments`).expect(201);
      await upload(ana, `/api/comments/${comment.id}/attachments`).expect(403);

      const list = (await ana.get(`/api/ideas/${number}/comments`).expect(200)).body;
      expect(list[0].attachments).toEqual([body]);
      await ana.get(`/api/attachments/${body.id}`).expect(200);
    });

    it('a hidden Comment hides its files from whoever cannot read the text', async () => {
      const number = await newIdea();
      const comment = (
        await carla.post(`/api/ideas/${number}/comments`).send({ text: 'Ofensivo' }).expect(201)
      ).body;
      const { body } = await upload(carla, `/api/comments/${comment.id}/attachments`).expect(201);
      await bruno
        .post(`/api/comments/${comment.id}/hide`)
        .send({ reason: 'Fora das regras' })
        .expect(200);

      await ana.get(`/api/attachments/${body.id}`).expect(404);
      expect((await ana.get(`/api/ideas/${number}/comments`)).body[0].attachments).toEqual([]);
      await carla.get(`/api/attachments/${body.id}`).expect(200);
      await bruno.get(`/api/attachments/${body.id}`).expect(200);
    });

    it('removing the Comment removes its files', async () => {
      const number = await newIdea();
      const comment = (
        await carla.post(`/api/ideas/${number}/comments`).send({ text: 'Apagar' }).expect(201)
      ).body;
      const { body } = await upload(carla, `/api/comments/${comment.id}/attachments`).expect(201);
      await carla.delete(`/api/comments/${comment.id}`).expect(204);
      await carla.get(`/api/attachments/${body.id}`).expect(404);
    });
  });
});
