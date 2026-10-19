import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

const numbers = (body: { items: { number: number }[] }) => body.items.map((i) => i.number);

describe('Ideas', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser; // Author
  let bruno: Browser; // TI Reviewer
  let carla: Browser; // Colleague without a role
  let ti: string;
  let processes: string;
  let field: { situation: string; proposal: string; benefit: string };

  const complete = () => ({
    [field.situation]: 'O relatório de vendas leva 2 horas para gerar',
    [field.proposal]: 'Agendar a geração durante a madrugada',
  });

  async function newIdea(who: Browser, data: Record<string, unknown> = {}) {
    const response = await who
      .post('/api/ideas')
      .send({
        title: 'Relatório mais rápido',
        categoryId: ti,
        values: complete(),
        publish: true,
        ...data,
      })
      .expect(201);
    return response.body as { number: number; status: string };
  }

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    const reviewer = await createCollaborator(sim, admin, 'Bruno');
    bruno = reviewer.browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;

    ti = (await admin.post('/api/categories').send({ name: 'TI' }).expect(201)).body.id;
    processes = (await admin.post('/api/categories').send({ name: 'Processos' }).expect(201)).body
      .id;
    await admin
      .put(`/api/categories/${ti}/reviewers`)
      .send({ collaboratorIds: [reviewer.id] })
      .expect(200);

    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      label: string;
    }[];
    const byLabel = (label: string) => fields.find((f) => f.label === label)!.id;
    field = {
      situation: byLabel('Situação atual'),
      proposal: byLabel('Proposta'),
      benefit: byLabel('Benefício esperado'),
    };
  });

  afterAll(() => sim.close());

  describe('Draft and publishing', () => {
    it('a Draft may be incomplete and only its Author sees it', async () => {
      const { body } = await ana
        .post('/api/ideas')
        .send({ title: 'Ideia em construção', categoryId: ti })
        .expect(201);
      expect(body.status).toBe('draft');

      await carla.get(`/api/ideas/${body.number}`).expect(404);
      const carlaList = await carla.get('/api/ideas').expect(200);
      expect(numbers(carlaList.body)).not.toContain(body.number);
      const mine = await ana.get('/api/ideas?author=me').expect(200);
      expect(numbers(mine.body)).toContain(body.number);
    });

    it('publishing requires the required fields, pointing out the missing ones', async () => {
      const { body } = await ana
        .post('/api/ideas')
        .send({
          title: 'Rascunho incompleto',
          categoryId: ti,
          values: { [field.situation]: 'Algo' },
        })
        .expect(201);

      const failure = await ana.post(`/api/ideas/${body.number}/publish`).expect(400);
      expect(failure.body).toMatchObject({
        code: 'INVALID_FIELDS',
        details: { [field.proposal]: 'required' },
      });

      await ana.patch(`/api/ideas/${body.number}`).send({ values: complete() }).expect(200);
      const published = await ana.post(`/api/ideas/${body.number}/publish`).expect(200);
      expect(published.body).toMatchObject({ status: 'open', editedAt: null });
      expect(published.body.history).toEqual([
        expect.objectContaining({ type: 'status', from: null, to: 'open', justification: null }),
      ]);
      expect(published.body.answers.map((a: { label: string }) => a.label)).toEqual([
        'Situação atual',
        'Proposta',
      ]);

      await carla.get(`/api/ideas/${body.number}`).expect(200);
    });

    it('does not accept an inactive Category', async () => {
      const { body: old } = await admin
        .post('/api/categories')
        .send({ name: 'Antiga' })
        .expect(201);
      await admin.patch(`/api/categories/${old.id}`).send({ active: false }).expect(200);
      const { body } = await ana
        .post('/api/ideas')
        .send({ title: 'X', categoryId: old.id, values: complete(), publish: true })
        .expect(400);
      expect(body.code).toBe('CATEGORY_UNAVAILABLE');
    });
  });

  describe('review', () => {
    it('the Category Reviewer moves the Idea forward, always with a justification', async () => {
      const { number } = await newIdea(ana);

      const forBruno = await bruno.get(`/api/ideas/${number}`).expect(200);
      expect(forBruno.body.permissions.transitions).toEqual([
        'under_review',
        'duplicate',
        'archived',
      ]);

      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: ' ' })
        .expect(400);
      const underReview = await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'Vamos medir o tempo atual' })
        .expect(200);
      expect(underReview.body.status).toBe('under_review');
      expect(underReview.body.history.at(-1)).toMatchObject({
        from: 'open',
        to: 'under_review',
        justification: 'Vamos medir o tempo atual',
        collaborator: { name: 'Bruno' },
      });

      // Transition outside the lifecycle
      const skip = await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'done', justification: 'Skipping steps' })
        .expect(409);
      expect(skip.body.code).toBe('INVALID_TRANSITION');
    });

    it('colleagues and the Author herself do not change the Status', async () => {
      const { number } = await newIdea(ana);
      for (const who of [carla, ana]) {
        const response = await who
          .post(`/api/ideas/${number}/status`)
          .send({ to: 'under_review', justification: 'I want to' })
          .expect(403);
        expect(response.body.code).toBe('FORBIDDEN');
      }
    });

    it('a Reviewer does not review their own Idea; the Administrator can', async () => {
      const { number } = await newIdea(bruno);
      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'Mine' })
        .expect(403);
      await admin
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'Taken over by the administration' })
        .expect(200);
    });

    it('from Under review on the text is locked for the Author', async () => {
      const { number } = await newIdea(ana);
      await ana.patch(`/api/ideas/${number}`).send({ title: 'Ainda posso mudar' }).expect(200);
      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'Starting' })
        .expect(200);
      const { body } = await ana
        .patch(`/api/ideas/${number}`)
        .send({ title: 'Mudar depois' })
        .expect(409);
      expect(body.code).toBe('EDIT_LOCKED');
    });

    it('editing after publishing marks the Idea as edited', async () => {
      const { number } = await newIdea(ana);
      const edited = await ana
        .patch(`/api/ideas/${number}`)
        .send({ title: 'Novo título' })
        .expect(200);
      expect(edited.body.editedAt).not.toBeNull();
    });

    it('a Duplicate points to the original Idea', async () => {
      const original = await newIdea(carla, { title: 'Original' });
      const { number } = await newIdea(ana);

      const missing = await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'duplicate', justification: 'Already exists' })
        .expect(400);
      expect(missing.body.code).toBe('INVALID_ORIGINAL_IDEA');
      const duplicate = await bruno
        .post(`/api/ideas/${number}/status`)
        .send({
          to: 'duplicate',
          justification: 'Already exists',
          originalIdeaNumber: original.number,
        })
        .expect(200);
      expect(duplicate.body).toMatchObject({
        status: 'duplicate',
        originalIdea: { number: original.number, title: 'Original' },
        permissions: { transitions: [] },
      });
    });

    it('recategorizing records the History and changes who reviews', async () => {
      const { number } = await newIdea(ana);
      await carla
        .post(`/api/ideas/${number}/category`)
        .send({ categoryId: processes, justification: 'x' })
        .expect(403);

      const moved = await bruno
        .post(`/api/ideas/${number}/category`)
        .send({ categoryId: processes, justification: 'É um ajuste de processo, não de sistema' })
        .expect(200);
      expect(moved.body.category).toEqual({ id: processes, name: 'Processos' });
      expect(moved.body.history.at(-1)).toMatchObject({
        type: 'category',
        from: 'TI',
        to: 'Processos',
      });

      // Processos has no Reviewers: Bruno loses power over the Idea, which goes to the Administrators.
      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'x' })
        .expect(403);
      await admin
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'under_review', justification: 'Administration takes over' })
        .expect(200);
    });
  });

  describe('listing', () => {
    it('Archived Ideas leave the default list but show up in the filter', async () => {
      const { number } = await newIdea(ana, { title: 'Vai ser arquivada' });
      await bruno
        .post(`/api/ideas/${number}/status`)
        .send({ to: 'archived', justification: 'Not relevant today' })
        .expect(200);

      const byDefault = await carla.get('/api/ideas?pageSize=50').expect(200);
      expect(numbers(byDefault.body)).not.toContain(number);
      const archived = await carla.get('/api/ideas?status=archived').expect(200);
      expect(numbers(archived.body)).toContain(number);
    });

    it('filters by Category and paginates', async () => {
      const page = await carla.get(`/api/ideas?categoryId=${ti}&pageSize=2&page=1`).expect(200);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.total).toBeGreaterThan(2);
      expect(page.body.items.every((i: { category: { id: string } }) => i.category.id === ti)).toBe(
        true,
      );
    });
  });

  describe('deletion', () => {
    it('the Author deletes an Open Idea, but not one already under review', async () => {
      const open = await newIdea(ana);
      await carla.delete(`/api/ideas/${open.number}`).expect(403);
      await ana.delete(`/api/ideas/${open.number}`).expect(204);
      await ana.get(`/api/ideas/${open.number}`).expect(404);

      const underReview = await newIdea(ana);
      await bruno
        .post(`/api/ideas/${underReview.number}/status`)
        .send({ to: 'under_review', justification: 'ok' })
        .expect(200);
      const { body } = await ana.delete(`/api/ideas/${underReview.number}`).expect(409);
      expect(body.code).toBe('DELETE_BLOCKED');
    });

    it('a Category with Ideas cannot be deleted, only deactivated', async () => {
      const { body } = await admin.delete(`/api/categories/${ti}`).expect(409);
      expect(body.code).toBe('CATEGORY_IN_USE');
      const { body: empty } = await admin
        .post('/api/categories')
        .send({ name: 'Vazia' })
        .expect(201);
      await admin.delete(`/api/categories/${empty.id}`).expect(204);
    });
  });

  describe('Custom Fields', () => {
    it('the installation starts with Situação atual, Proposta and Benefício esperado', async () => {
      const { body } = await carla.get('/api/custom-fields').expect(200);
      expect(body.map((f: { label: string; required: boolean }) => [f.label, f.required])).toEqual([
        ['Situação atual', true],
        ['Proposta', true],
        ['Benefício esperado', false],
      ]);
    });

    it('the Administrator creates choice fields, with options', async () => {
      const noOptions = await admin
        .post('/api/custom-fields')
        .send({ label: 'Área', type: 'single_choice' })
        .expect(400);
      expect(noOptions.body.code).toBe('FIELD_OPTIONS_REQUIRED');
      await carla
        .post('/api/custom-fields')
        .send({ label: 'Área', type: 'single_choice', options: ['Fábrica', 'Escritório'] })
        .expect(403);
      const { body } = await admin
        .post('/api/custom-fields')
        .send({ label: 'Área', type: 'single_choice', options: ['Fábrica', 'Escritório'] })
        .expect(201);
      expect(body).toMatchObject({ position: 4, active: true });

      const invalid = await ana
        .post('/api/ideas')
        .send({ title: 'Com área', categoryId: ti, values: { ...complete(), [body.id]: 'Lua' } })
        .expect(400);
      expect(invalid.body.details).toEqual({ [body.id]: 'invalid_option' });
    });

    it('a field used on Ideas is not deleted; deactivated, the value stays on the Idea', async () => {
      const { number } = await newIdea(ana, {
        values: { ...complete(), [field.benefit]: 'Economia de 2h por dia' },
      });
      const inUse = await admin.delete(`/api/custom-fields/${field.benefit}`).expect(409);
      expect(inUse.body.code).toBe('FIELD_IN_USE');
      await admin.patch(`/api/custom-fields/${field.benefit}`).send({ active: false }).expect(200);

      const idea = await carla.get(`/api/ideas/${number}`).expect(200);
      expect(idea.body.answers).toContainEqual(
        expect.objectContaining({ label: 'Benefício esperado', value: 'Economia de 2h por dia' }),
      );
      const active = await carla.get('/api/custom-fields').expect(200);
      expect(active.body.map((f: { label: string }) => f.label)).not.toContain(
        'Benefício esperado',
      );

      await admin.patch(`/api/custom-fields/${field.benefit}`).send({ active: true }).expect(200);
    });

    it('the Administrator reorders the fields', async () => {
      const { body: all } = await admin.get('/api/custom-fields?includeInactive=true').expect(200);
      const reversed = [...all].reverse().map((f: { id: string }) => f.id);
      const { body } = await admin
        .put('/api/custom-fields/order')
        .send({ ids: reversed })
        .expect(200);
      expect(body.map((f: { id: string }) => f.id)).toEqual(reversed);
      const incomplete = await admin
        .put('/api/custom-fields/order')
        .send({ ids: reversed.slice(1) })
        .expect(400);
      expect(incomplete.body.code).toBe('FIELD_ORDER_INCOMPLETE');
    });
  });
});
