import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AppDeTeste, criarApp, EMERGENCIA } from './support/app';

describe('Categorias e Avaliadores', () => {
  let sim: AppDeTeste;
  let admin: ReturnType<AppDeTeste['navegador']>;
  let colaborador: ReturnType<AppDeTeste['navegador']>;
  let idColaborador: string;

  beforeAll(async () => {
    sim = await criarApp();
    admin = sim.navegador();
    await admin.post('/api/auth/login').send({ email: EMERGENCIA.email, senha: EMERGENCIA.senha });

    const conta = await admin
      .post('/api/colaboradores')
      .send({ nome: 'Carlos', email: 'carlos@empresa.test' })
      .expect(201);
    idColaborador = conta.body.colaborador.id;
    colaborador = sim.navegador();
    await colaborador
      .post('/api/auth/login')
      .send({ email: 'carlos@empresa.test', senha: conta.body.senhaTemporaria });
    await colaborador
      .post('/api/auth/trocar-senha')
      .send({ senhaAtual: conta.body.senhaTemporaria, novaSenha: 'senha-do-carlos-123' })
      .expect(204);
  });

  afterAll(() => sim.fechar());

  it('Administrador cria Categorias com descrição', async () => {
    const response = await admin
      .post('/api/categorias')
      .send({ nome: '  TI ', descricao: 'Sistemas, equipamentos e acessos' })
      .expect(201);
    expect(response.body).toMatchObject({
      nome: 'TI',
      descricao: 'Sistemas, equipamentos e acessos',
      ativa: true,
      avaliadores: [],
    });
  });

  it('não permite dois nomes iguais, ignorando maiúsculas', async () => {
    await admin.post('/api/categorias').send({ nome: 'Facilities' }).expect(201);
    await admin.post('/api/categorias').send({ nome: 'FACILITIES' }).expect(409);
  });

  it('Colaborador comum lista Categorias, mas não as gerencia', async () => {
    await colaborador.get('/api/categorias').expect(200);
    await colaborador.post('/api/categorias').send({ nome: 'RH' }).expect(403);
  });

  it('Categoria desativada some para Colaboradores e continua visível ao Administrador', async () => {
    const { body } = await admin.post('/api/categorias').send({ nome: 'Antiga' }).expect(201);
    await admin.patch(`/api/categorias/${body.id}`).send({ ativa: false }).expect(200);

    const paraColaborador = await colaborador
      .get('/api/categorias?incluirInativas=true')
      .expect(200);
    expect(paraColaborador.body.map((c: { nome: string }) => c.nome)).not.toContain('Antiga');

    const paraAdmin = await admin.get('/api/categorias?incluirInativas=true').expect(200);
    expect(paraAdmin.body).toContainEqual(
      expect.objectContaining({ nome: 'Antiga', ativa: false }),
    );
  });

  it('renomear para um nome já usado é recusado', async () => {
    const { body } = await admin.post('/api/categorias').send({ nome: 'Processos' }).expect(201);
    await admin.patch(`/api/categorias/${body.id}`).send({ nome: 'ti' }).expect(409);
    await admin
      .patch('/api/categorias/00000000-0000-4000-8000-000000000000')
      .send({ nome: 'X' })
      .expect(404);
  });

  it('Administrador define os Avaliadores de uma Categoria', async () => {
    const { body: categoria } = await admin
      .post('/api/categorias')
      .send({ nome: 'Financeiro' })
      .expect(201);

    const comAvaliador = await admin
      .put(`/api/categorias/${categoria.id}/avaliadores`)
      .send({ colaboradorIds: [idColaborador] })
      .expect(200);
    expect(comAvaliador.body.avaliadores).toEqual([{ id: idColaborador, nome: 'Carlos' }]);

    const semAvaliador = await admin
      .put(`/api/categorias/${categoria.id}/avaliadores`)
      .send({ colaboradorIds: [] })
      .expect(200);
    expect(semAvaliador.body.avaliadores).toEqual([]);
  });

  it('só Colaboradores ativos podem ser Avaliadores', async () => {
    const { body: categoria } = await admin
      .post('/api/categorias')
      .send({ nome: 'Jurídico' })
      .expect(201);
    const inativo = await admin
      .post('/api/colaboradores')
      .send({ nome: 'Ex', email: 'ex@empresa.test' })
      .expect(201);
    await sim.pool.query(`update colaboradores set ativo = false where id = $1`, [
      inativo.body.colaborador.id,
    ]);

    await admin
      .put(`/api/categorias/${categoria.id}/avaliadores`)
      .send({ colaboradorIds: [inativo.body.colaborador.id] })
      .expect(400);
    await admin
      .put(`/api/categorias/${categoria.id}/avaliadores`)
      .send({ colaboradorIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);
  });
});
