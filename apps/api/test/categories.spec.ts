import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('Categories and Reviewers', () => {
  let sim: TestApp;
  let admin: Browser;
  let colleague: Browser;
  let colleagueId: string;

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    const account = await createCollaborator(sim, admin, 'Carlos');
    colleague = account.browser;
    colleagueId = account.id;
  });

  afterAll(() => sim.close());

  it('the Administrator creates Categories with a description', async () => {
    const response = await admin
      .post('/api/categories')
      .send({ name: '  TI ', description: 'Sistemas, equipamentos e acessos' })
      .expect(201);
    expect(response.body).toMatchObject({
      name: 'TI',
      description: 'Sistemas, equipamentos e acessos',
      active: true,
      reviewers: [],
    });
  });

  it('does not allow two equal names, ignoring case', async () => {
    await admin.post('/api/categories').send({ name: 'Facilities' }).expect(201);
    const { body } = await admin.post('/api/categories').send({ name: 'FACILITIES' }).expect(409);
    expect(body.code).toBe('CATEGORY_NAME_TAKEN');
  });

  it('a regular Collaborator lists Categories but does not manage them', async () => {
    await colleague.get('/api/categories').expect(200);
    await colleague.post('/api/categories').send({ name: 'RH' }).expect(403);
  });

  it('an inactive Category disappears for Collaborators and stays visible to the Administrator', async () => {
    const { body } = await admin.post('/api/categories').send({ name: 'Antiga' }).expect(201);
    await admin.patch(`/api/categories/${body.id}`).send({ active: false }).expect(200);

    const forColleague = await colleague.get('/api/categories?includeInactive=true').expect(200);
    expect(forColleague.body.map((c: { name: string }) => c.name)).not.toContain('Antiga');

    const forAdmin = await admin.get('/api/categories?includeInactive=true').expect(200);
    expect(forAdmin.body).toContainEqual(
      expect.objectContaining({ name: 'Antiga', active: false }),
    );
  });

  it('renaming to a name already in use is rejected', async () => {
    const { body } = await admin.post('/api/categories').send({ name: 'Processos' }).expect(201);
    await admin.patch(`/api/categories/${body.id}`).send({ name: 'ti' }).expect(409);
    await admin
      .patch('/api/categories/00000000-0000-4000-8000-000000000000')
      .send({ name: 'X' })
      .expect(404);
  });

  it('the Administrator sets the Reviewers of a Category', async () => {
    const { body: category } = await admin
      .post('/api/categories')
      .send({ name: 'Financeiro' })
      .expect(201);

    const withReviewer = await admin
      .put(`/api/categories/${category.id}/reviewers`)
      .send({ collaboratorIds: [colleagueId] })
      .expect(200);
    expect(withReviewer.body.reviewers).toEqual([
      { id: colleagueId, name: 'Carlos', viaSso: false },
    ]);

    const withoutReviewer = await admin
      .put(`/api/categories/${category.id}/reviewers`)
      .send({ collaboratorIds: [] })
      .expect(200);
    expect(withoutReviewer.body.reviewers).toEqual([]);
  });

  it('only active Collaborators can be Reviewers', async () => {
    const { body: category } = await admin
      .post('/api/categories')
      .send({ name: 'Jurídico' })
      .expect(201);
    const inactive = await admin
      .post('/api/collaborators')
      .send({ name: 'Ex', email: 'ex@company.test' })
      .expect(201);
    await sim.pool.query(`update collaborators set active = false where id = $1`, [
      inactive.body.collaborator.id,
    ]);

    const { body } = await admin
      .put(`/api/categories/${category.id}/reviewers`)
      .send({ collaboratorIds: [inactive.body.collaborator.id] })
      .expect(400);
    expect(body.code).toBe('INACTIVE_REVIEWERS');
    await admin
      .put(`/api/categories/${category.id}/reviewers`)
      .send({ collaboratorIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);
  });
});
