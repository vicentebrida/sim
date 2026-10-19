import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renameMention } from '../src/comments/domain/mentions';
import { CollaboratorsService } from '../src/collaborators/collaborators.service';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

const ID = '8b3e4c6a-2f9d-4b7a-9c73-5e4d3f2a1b0c';

describe('renameMention', () => {
  it('renames only the mentions of that person', () => {
    const other = '11111111-1111-4111-8111-111111111111';
    expect(renameMention(`Oi @[Carla](${ID}) e @[Davi](${other})`, ID, 'Ex-colaborador')).toBe(
      `Oi @[Ex-colaborador](${ID}) e @[Davi](${other})`,
    );
  });
});

describe('Collaborator life cycle', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser; // Author
  let carla: Browser; // Reviewer who leaves
  let ids: { ana: string; carla: string };
  let ti: string;
  let values: Record<string, string>;

  const audit = async () =>
    (await admin.get('/api/audit').expect(200)).body.items as {
      action: string;
      targetId: string;
      actor: { name: string } | null;
    }[];

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    const a = await createCollaborator(sim, admin, 'Ana');
    const c = await createCollaborator(sim, admin, 'Carla');
    [ana, carla] = [a.browser, c.browser];
    ids = { ana: a.id, carla: c.id };
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    await admin.put(`/api/categories/${ti}/reviewers`).send({ collaboratorIds: [ids.carla] });
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    values = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
  });

  afterAll(() => sim.close());

  it('is for Administrators only', async () => {
    await ana.patch(`/api/collaborators/${ids.carla}`).send({ active: false }).expect(403);
    await ana.post(`/api/collaborators/${ids.carla}/anonymize`).expect(403);
    await ana.get('/api/audit').expect(403);
  });

  it('deactivating closes access and removes the Reviewer assignments, keeping the content', async () => {
    const idea = (
      await carla
        .post('/api/ideas')
        .send({ title: 'Ideia da Carla', categoryId: ti, values, publish: true })
        .expect(201)
    ).body.number as number;
    await carla.get('/api/auth/me').expect(200);

    const { body } = await admin
      .patch(`/api/collaborators/${ids.carla}`)
      .send({ active: false })
      .expect(200);
    expect(body).toMatchObject({ active: false, anonymized: false, name: 'Carla' });

    await carla.get('/api/auth/me').expect(401); // sessions closed
    const category = (await admin.get('/api/categories').expect(200)).body.find(
      (c: { id: string }) => c.id === ti,
    );
    expect(category.reviewers).toEqual([]);
    const shown = (await ana.get(`/api/ideas/${idea}`).expect(200)).body;
    expect(shown.author.name).toBe('Carla'); // the name stays visible

    expect((await audit())[0]).toMatchObject({
      action: 'collaborator.deactivated',
      targetId: ids.carla,
      actor: { name: 'Administrador' },
    });
  });

  it('reactivating gives access back', async () => {
    await admin.patch(`/api/collaborators/${ids.carla}`).send({ active: true }).expect(200);
    await sim
      .browser()
      .post('/api/auth/login')
      .send({ email: 'carla@company.test', password: 'password-of-Carla-123' })
      .expect(200);
  });

  it('does not let an Administrator deactivate themselves', async () => {
    const me = (await admin.get('/api/auth/me').expect(200)).body.id;
    const refused = await admin
      .patch(`/api/collaborators/${me}`)
      .send({ active: false })
      .expect(400);
    expect(refused.body.code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('one Administrator can deactivate and reactivate another', async () => {
    const me = (await admin.get('/api/auth/me').expect(200)).body.id;
    const second = await createCollaborator(sim, admin, 'Segundo', { administrator: true });
    await second.browser.patch(`/api/collaborators/${me}`).send({ active: false }).expect(200);
    await second.browser.patch(`/api/collaborators/${me}`).send({ active: true }).expect(200);
    admin = await signInAsAdministrator(sim); // the first session was closed by the deactivation
  });

  it('anonymizes only the inactive, erasing personal data and keeping the content', async () => {
    const departing = await createCollaborator(sim, admin, 'Eduardo');
    const idea = (
      await departing.browser
        .post('/api/ideas')
        .send({ title: 'Ideia do Eduardo', categoryId: ti, values, publish: true })
        .expect(201)
    ).body.number as number;
    await ana
      .post(`/api/ideas/${idea}/comments`)
      .send({ text: `Obrigada, @[Eduardo](${departing.id})!` })
      .expect(201);
    await departing.browser
      .post(`/api/ideas/${idea}/comments`)
      .send({ text: 'Meu comentário' })
      .expect(201);

    const early = await admin.post(`/api/collaborators/${departing.id}/anonymize`).expect(409);
    expect(early.body.code).toBe('NOT_INACTIVE');

    await admin.patch(`/api/collaborators/${departing.id}`).send({ active: false }).expect(200);
    const { body } = await admin.post(`/api/collaborators/${departing.id}/anonymize`).expect(200);
    expect(body).toMatchObject({
      name: 'Ex-colaborador',
      anonymized: true,
      active: false,
      department: null,
      pictureUrl: null,
    });
    expect(body.email).not.toContain('eduardo');

    const stored = (
      await sim.pool.query('select password_hash, sso_subject from collaborators where id = $1', [
        departing.id,
      ])
    ).rows[0];
    expect(stored).toEqual({ password_hash: null, sso_subject: null });

    const shown = (await ana.get(`/api/ideas/${idea}`).expect(200)).body;
    expect(shown.author.name).toBe('Ex-colaborador');
    const comments = (await ana.get(`/api/ideas/${idea}/comments`).expect(200)).body;
    expect(
      comments.map((c: { text: string; author: { name: string } }) => [c.author.name, c.text]),
    ).toEqual([
      ['Ana', `Obrigada, @[Ex-colaborador](${departing.id})!`],
      ['Ex-colaborador', 'Meu comentário'],
    ]);

    await sim
      .http()
      .post('/api/auth/login')
      .send({ email: 'eduardo@company.test', password: 'password-of-Eduardo-123' })
      .expect(401);
    const again = await admin.post(`/api/collaborators/${departing.id}/anonymize`).expect(409);
    expect(again.body.code).toBe('ALREADY_ANONYMIZED');
    const back = await admin
      .patch(`/api/collaborators/${departing.id}`)
      .send({ active: true })
      .expect(409);
    expect(back.body.code).toBe('ALREADY_ANONYMIZED');
    expect((await audit())[0]).toMatchObject({
      action: 'collaborator.anonymized',
      targetId: departing.id,
    });
  });

  it('the audit log cannot be rewritten, not even by the database user of the app', async () => {
    await expect(sim.pool.query(`update audit_log set action = 'x'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(sim.pool.query('delete from audit_log')).rejects.toThrow(/append-only/);
  });

  it('deactivates by inactivity, sparing Administrators, and says it was the system', async () => {
    const idle = await createCollaborator(sim, admin, 'Parado');
    const active = await createCollaborator(sim, admin, 'Ativo');
    await sim.pool.query(
      `update collaborators set last_login_at = now() - interval '100 days' where id = $1`,
      [idle.id],
    );
    await sim.pool.query(
      `update collaborators set last_login_at = now() - interval '100 days' where administrator`,
    );
    const done = await sim.app.get(CollaboratorsService).deactivateInactive(90);
    expect(done).toBeGreaterThanOrEqual(1);

    const people = (await admin.get('/api/collaborators').expect(200)).body as {
      id: string;
      active: boolean;
      administrator: boolean;
    }[];
    expect(people.find((p) => p.id === idle.id)?.active).toBe(false);
    expect(people.find((p) => p.id === active.id)?.active).toBe(true);
    expect(people.filter((p) => p.administrator).every((p) => p.active)).toBe(true);
    expect((await audit()).find((e) => e.targetId === idle.id)).toMatchObject({
      action: 'collaborator.auto_deactivated',
      actor: null,
    });
  });
});
