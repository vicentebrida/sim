import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FieldDefinition, fieldsFor } from '../src/ideas/domain/fields';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('fieldsFor', () => {
  const field = (id: string, categoryIds: string[], active = true): FieldDefinition => ({
    id,
    label: id,
    type: 'short_text',
    required: false,
    options: [],
    active,
    categoryIds,
  });

  it('keeps the fields for all Categories, the ones that include it, and the deactivated', () => {
    const list = [
      field('all', []),
      field('ti', ['ti']),
      field('rh', ['rh']),
      field('old', ['rh'], false),
    ];
    expect(fieldsFor(list, 'ti').map((f) => f.id)).toEqual(['all', 'ti', 'old']);
  });
});

describe('Custom Fields per Category', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let ti: string;
  let rh: string;
  let base: Record<string, string>; // the default required fields
  let securityField: string; // required, only for TI

  const idea = (categoryId: string, values: Record<string, unknown>, publish = true) =>
    ana.post('/api/ideas').send({ title: 'Ideia', categoryId, values, publish });

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    rh = (await admin.post('/api/categories').send({ name: 'RH' }).expect(201)).body.id;
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      required: boolean;
    }[];
    base = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, 'Texto']));
    securityField = (
      await admin
        .post('/api/custom-fields')
        .send({ label: 'Sistema afetado', type: 'short_text', required: true, categoryIds: [ti] })
        .expect(201)
    ).body.id;
  });

  afterAll(() => sim.close());

  it('lists the Categories a field applies to', async () => {
    const list = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      categoryIds: string[];
    }[];
    expect(list.find((f) => f.id === securityField)?.categoryIds).toEqual([ti]);
    expect(
      list.filter((f) => f.id !== securityField).every((f) => f.categoryIds.length === 0),
    ).toBe(true);
  });

  it('requires the field only in its Category', async () => {
    const refused = await idea(ti, base).then((r) => r);
    expect(refused.status).toBe(400);
    expect(refused.body.details[securityField]).toBe('required');

    await idea(ti, { ...base, [securityField]: 'ERP' }).then((r) => expect(r.status).toBe(201));
    await idea(rh, base).then((r) => expect(r.status).toBe(201));
  });

  it('refuses a value for a field that does not apply to the Category', async () => {
    const refused = await idea(rh, { ...base, [securityField]: 'ERP' }).then((r) => r);
    expect(refused.status).toBe(400);
    expect(refused.body.details[securityField]).toBe('unknown_field');
  });

  it('checks the Category change against the new Category, dropping what no longer applies', async () => {
    const created = (await idea(ti, { ...base, [securityField]: 'ERP' }).then((r) => r)).body;
    // TI → RH: the scoped answer goes away, nothing else is required.
    const moved = await ana
      .patch(`/api/ideas/${created.number}`)
      .send({ categoryId: rh })
      .expect(200);
    expect(moved.body.category.id).toBe(rh);
    expect(moved.body.values[securityField]).toBeUndefined();

    // RH → TI: the field is required again, so the change is refused until it is answered.
    const back = await ana
      .patch(`/api/ideas/${created.number}`)
      .send({ categoryId: ti })
      .expect(400);
    expect(back.body.details[securityField]).toBe('required');
    await ana
      .patch(`/api/ideas/${created.number}`)
      .send({ categoryId: ti, values: { ...base, [securityField]: 'CRM' } })
      .expect(200);

    const versions = (await ana.get(`/api/ideas/${created.number}/versions`).expect(200)).body;
    expect(versions).toHaveLength(2);
    expect(versions[0].answers.some((a: { value: unknown }) => a.value === 'ERP')).toBe(true);
  });

  it('can be changed to another set of Categories, and validates them', async () => {
    await admin
      .patch(`/api/custom-fields/${securityField}`)
      .send({ categoryIds: [ti, rh] })
      .expect(200);
    await idea(rh, { ...base, [securityField]: 'ERP' }).then((r) => expect(r.status).toBe(201));

    const unknown = await admin
      .patch(`/api/custom-fields/${securityField}`)
      .send({ categoryIds: ['11111111-1111-4111-8111-111111111111'] })
      .expect(400);
    expect(unknown.body.code).toBe('CATEGORY_UNAVAILABLE');

    await admin.patch(`/api/custom-fields/${securityField}`).send({ categoryIds: [] }).expect(200);
    await idea(rh, base).then((r) => expect(r.status).toBe(400)); // now required everywhere
    await admin
      .patch(`/api/custom-fields/${securityField}`)
      .send({ categoryIds: [ti] })
      .expect(200);
  });

  it('deleting a Category switches off the fields that only applied to it', async () => {
    const lonely = (await admin.post('/api/categories').send({ name: 'Efêmera' }).expect(201)).body
      .id;
    const only = (
      await admin
        .post('/api/custom-fields')
        .send({ label: 'Só da Efêmera', type: 'short_text', categoryIds: [lonely] })
        .expect(201)
    ).body.id;
    const shared = (
      await admin
        .post('/api/custom-fields')
        .send({ label: 'Da Efêmera e RH', type: 'short_text', categoryIds: [lonely, rh] })
        .expect(201)
    ).body.id;
    await admin.delete(`/api/categories/${lonely}`).expect(204);

    const list = (
      await admin.get('/api/custom-fields').query({ includeInactive: true }).expect(200)
    ).body as { id: string; active: boolean; categoryIds: string[] }[];
    expect(list.find((f) => f.id === only)).toMatchObject({ active: false, categoryIds: [] });
    expect(list.find((f) => f.id === shared)).toMatchObject({ active: true, categoryIds: [rh] });
  });
});
