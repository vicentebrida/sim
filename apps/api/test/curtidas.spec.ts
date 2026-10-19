import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AppDeTeste,
  criarApp,
  criarColaborador,
  entrarComoAdministrador,
} from './support/app';

type Navegador = ReturnType<AppDeTeste['navegador']>;

describe('Curtidas', () => {
  let sim: AppDeTeste;
  let admin: Navegador;
  let ana: Navegador; // Autora
  let bruno: Navegador;
  let carla: Navegador;
  let davi: Navegador;
  let ti: string;
  let valores: Record<string, string>;

  async function novaIdeia(quem: Navegador, dados: Record<string, unknown> = {}) {
    const response = await quem
      .post('/api/ideias')
      .send({
        titulo: 'Café na copa do 3º andar',
        categoriaId: ti,
        valores,
        publicar: true,
        ...dados,
      })
      .expect(201);
    return response.body.numero as number;
  }

  const mudarStatus = (numero: number, para: string, extra: Record<string, unknown> = {}) =>
    admin
      .post(`/api/ideias/${numero}/status`)
      .send({ para, justificativa: 'Decisão do comitê', ...extra })
      .expect(200);

  beforeAll(async () => {
    sim = await criarApp();
    admin = await entrarComoAdministrador(sim);
    ana = (await criarColaborador(sim, admin, 'Ana')).navegador;
    bruno = (await criarColaborador(sim, admin, 'Bruno')).navegador;
    carla = (await criarColaborador(sim, admin, 'Carla')).navegador;
    davi = (await criarColaborador(sim, admin, 'Davi')).navegador;
    ti = (await admin.post('/api/categorias').send({ nome: 'TI' }).expect(201)).body.id;

    const campos = (await ana.get('/api/campos-personalizados').expect(200)).body as {
      id: string;
      obrigatorio: boolean;
    }[];
    valores = Object.fromEntries(
      campos.filter((c) => c.obrigatorio).map((c) => [c.id, 'Texto de exemplo']),
    );
  });

  afterAll(() => sim.fechar());

  it('colega curte uma vez só, desfaz e todos veem quem curtiu', async () => {
    const numero = await novaIdeia(ana);

    const curtida = await bruno.put(`/api/ideias/${numero}/curtida`).expect(200);
    expect(curtida.body).toEqual({ total: 1, curtiu: true });
    // Curtir de novo não conta em dobro.
    await bruno.put(`/api/ideias/${numero}/curtida`).expect(200, { total: 1, curtiu: true });
    await carla.put(`/api/ideias/${numero}/curtida`).expect(200, { total: 2, curtiu: true });

    const detalhe = await ana.get(`/api/ideias/${numero}`).expect(200);
    expect(detalhe.body.curtidas).toEqual({ total: 2, curtiu: false });
    expect(detalhe.body.permissoes.podeCurtir).toBe(false);

    const quem = await davi.get(`/api/ideias/${numero}/curtidas`).expect(200);
    expect(quem.body.map((c: { colaborador: { nome: string } }) => c.colaborador.nome)).toEqual([
      'Carla',
      'Bruno',
    ]);

    await carla.delete(`/api/ideias/${numero}/curtida`).expect(200, { total: 1, curtiu: false });
    const lista = await bruno.get('/api/ideias').expect(200);
    expect(lista.body.itens.find((i: { numero: number }) => i.numero === numero).curtidas).toEqual({
      total: 1,
      curtiu: true,
    });
  });

  it('a Autora não curte a própria Ideia', async () => {
    const numero = await novaIdeia(ana);
    const { body } = await ana.put(`/api/ideias/${numero}/curtida`).expect(403);
    expect(body.codigo).toBe('SEM_PERMISSAO');
  });

  it('Curtidas ficam congeladas fora dos Status em andamento', async () => {
    const numero = await novaIdeia(ana);
    await bruno.put(`/api/ideias/${numero}/curtida`).expect(200);
    await mudarStatus(numero, 'arquivada');

    const curtir = await carla.put(`/api/ideias/${numero}/curtida`).expect(409);
    expect(curtir.body.codigo).toBe('CURTIDA_INDISPONIVEL');
    // Também não dá para desfazer: o apoio registrado fica como estava.
    await bruno.delete(`/api/ideias/${numero}/curtida`).expect(409);
    expect((await bruno.get(`/api/ideias/${numero}`).expect(200)).body.curtidas.total).toBe(1);
  });

  it('Rascunho não pode ser curtido nem ter Curtidas listadas por outros', async () => {
    const { body } = await ana
      .post('/api/ideias')
      .send({ titulo: 'Rascunho', categoriaId: ti })
      .expect(201);
    await bruno.put(`/api/ideias/${body.numero}/curtida`).expect(404);
    await bruno.get(`/api/ideias/${body.numero}/curtidas`).expect(404);
  });

  it('Curtida de outra pessoa impede a Autora de excluir a Ideia Aberta', async () => {
    const numero = await novaIdeia(ana);
    await bruno.put(`/api/ideias/${numero}/curtida`).expect(200);

    const detalhe = await ana.get(`/api/ideias/${numero}`).expect(200);
    expect(detalhe.body.permissoes.podeExcluir).toBe(false);
    await ana.delete(`/api/ideias/${numero}`).expect(409);

    await bruno.delete(`/api/ideias/${numero}/curtida`).expect(200);
    await ana.delete(`/api/ideias/${numero}`).expect(204);
  });

  it('Duplicada leva as Curtidas para a Ideia Original, sem contar em dobro', async () => {
    const original = await novaIdeia(bruno, { titulo: 'Máquina de café nova' });
    const duplicada = await novaIdeia(ana, { titulo: 'Trocar a máquina de café' });

    await carla.put(`/api/ideias/${original}/curtida`).expect(200);
    await carla.put(`/api/ideias/${duplicada}/curtida`).expect(200);
    await davi.put(`/api/ideias/${duplicada}/curtida`).expect(200);
    // O Autor da Original curtiu a Duplicada: não vira Curtida na própria Ideia.
    await bruno.put(`/api/ideias/${duplicada}/curtida`).expect(200);

    await mudarStatus(duplicada, 'duplicada', { ideiaOriginalNumero: original });

    const quem = await ana.get(`/api/ideias/${original}/curtidas`).expect(200);
    expect(
      quem.body.map((c: { colaborador: { nome: string } }) => c.colaborador.nome).sort(),
    ).toEqual(['Carla', 'Davi']);
    expect((await ana.get(`/api/ideias/${duplicada}`).expect(200)).body.curtidas.total).toBe(0);
  });

  it('ordena por Em alta, Mais curtidas e Mais recentes', async () => {
    const categoria = (await admin.post('/api/categorias').send({ nome: 'Ordenação' }).expect(201))
      .body.id;
    const nova = (titulo: string) => novaIdeia(ana, { titulo, categoriaId: categoria });

    // Antiga com muitas Curtidas antigas, antiga com uma Curtida de hoje, e nova sem Curtidas.
    const antigaPopular = await nova('Antiga e popular');
    const antigaReaquecida = await nova('Antiga com apoio recente');
    const recente = await nova('Recente');
    for (const quem of [bruno, carla, davi]) {
      await quem.put(`/api/ideias/${antigaPopular}/curtida`).expect(200);
    }
    await bruno.put(`/api/ideias/${antigaReaquecida}/curtida`).expect(200);

    await sim.pool.query(
      `update ideias set publicada_em = now() - $2::interval where numero = $1`,
      [antigaPopular, '31 days'],
    );
    await sim.pool.query(
      `update ideias set publicada_em = now() - $2::interval where numero = $1`,
      [antigaReaquecida, '30 days'],
    );
    await sim.pool.query(
      `update curtidas set em = now() - interval '30 days'
       where ideia_id = (select id from ideias where numero = $1)`,
      [antigaPopular],
    );

    const ordem = async (ordem?: string) => {
      const { body } = await bruno
        .get('/api/ideias')
        .query({ categoriaId: categoria, ...(ordem ? { ordem } : {}) })
        .expect(200);
      return body.itens.map((i: { numero: number }) => i.numero);
    };

    // Em alta é a padrão: o apoio recente pesa mais que o acumulado há um mês.
    expect(await ordem()).toEqual([antigaReaquecida, recente, antigaPopular]);
    expect(await ordem('mais_curtidas')).toEqual([antigaPopular, antigaReaquecida, recente]);
    expect(await ordem('mais_recentes')).toEqual([recente, antigaReaquecida, antigaPopular]);
  });
});
