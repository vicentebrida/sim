import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AppDeTeste,
  criarApp,
  criarColaborador,
  entrarComoAdministrador,
} from './support/app';

type Navegador = ReturnType<AppDeTeste['navegador']>;
interface Comentario {
  id: string;
  texto: string | null;
  estado: string;
  editadoEm: string | null;
  ocultacao: { motivo: string; por: { nome: string } } | null;
  permissoes: Record<string, boolean>;
  respostas: Comentario[];
}

describe('Comentários', () => {
  let sim: AppDeTeste;
  let admin: Navegador;
  let ana: Navegador; // Autora das Ideias
  let bruno: Navegador; // Avaliador de TI
  let carla: Navegador;
  let ids: { ana: string; bruno: string; carla: string; joao: string };
  let ti: string;
  let valores: Record<string, string>;

  async function novaIdeia(dados: Record<string, unknown> = {}) {
    const { body } = await ana
      .post('/api/ideias')
      .send({ titulo: 'Bicicletário coberto', categoriaId: ti, valores, publicar: true, ...dados })
      .expect(201);
    return body.numero as number;
  }

  const comentar = async (quem: Navegador, numero: number, texto: string, respostaAId?: string) =>
    (await quem.post(`/api/ideias/${numero}/comentarios`).send({ texto, respostaAId }).expect(201))
      .body as Comentario;

  const comentariosVistosPor = async (quem: Navegador, numero: number) =>
    (await quem.get(`/api/ideias/${numero}/comentarios`).expect(200)).body as Comentario[];

  beforeAll(async () => {
    sim = await criarApp();
    admin = await entrarComoAdministrador(sim);
    const contaAna = await criarColaborador(sim, admin, 'Ana');
    const contaBruno = await criarColaborador(sim, admin, 'Bruno');
    const contaCarla = await criarColaborador(sim, admin, 'Carla');
    const contaJoao = await criarColaborador(sim, admin, 'João Araújo');
    [ana, bruno, carla] = [contaAna.navegador, contaBruno.navegador, contaCarla.navegador];
    ids = { ana: contaAna.id, bruno: contaBruno.id, carla: contaCarla.id, joao: contaJoao.id };

    ti = (await admin.post('/api/categorias').send({ nome: 'TI' }).expect(201)).body.id;
    await admin
      .put(`/api/categorias/${ti}/avaliadores`)
      .send({ colaboradorIds: [ids.bruno] })
      .expect(200);
    const campos = (await ana.get('/api/campos-personalizados').expect(200)).body as {
      id: string;
      obrigatorio: boolean;
    }[];
    valores = Object.fromEntries(
      campos.filter((c) => c.obrigatorio).map((c) => [c.id, 'Texto de exemplo']),
    );
  });

  afterAll(() => sim.fechar());

  it('Comentários têm um nível de Resposta, em ordem cronológica', async () => {
    const numero = await novaIdeia();
    const pergunta = await comentar(carla, numero, 'Quantas vagas seriam?');
    const resposta = await comentar(ana, numero, 'Umas 20', pergunta.id);
    await comentar(bruno, numero, 'Vou levantar o custo');

    const lista = await comentariosVistosPor(carla, numero);
    expect(lista.map((c) => c.texto)).toEqual(['Quantas vagas seriam?', 'Vou levantar o custo']);
    expect(lista[0]!.respostas.map((r) => r.texto)).toEqual(['Umas 20']);
    expect(lista[0]!.respostas[0]!.permissoes.podeResponder).toBe(false);

    const { body } = await carla
      .post(`/api/ideias/${numero}/comentarios`)
      .send({ texto: 'Resposta da resposta', respostaAId: resposta.id })
      .expect(409);
    expect(body.codigo).toBe('COMENTARIO_INDISPONIVEL');
  });

  it('Resposta precisa ser a um Comentário da mesma Ideia', async () => {
    const umaIdeia = await novaIdeia();
    const outraIdeia = await novaIdeia();
    const comentario = await comentar(carla, umaIdeia, 'Comentário na primeira');
    await carla
      .post(`/api/ideias/${outraIdeia}/comentarios`)
      .send({ texto: 'Cruzado', respostaAId: comentario.id })
      .expect(404);
  });

  it('dá pra comentar em Ideia Arquivada, mas não em Rascunho', async () => {
    const arquivada = await novaIdeia();
    await admin
      .post(`/api/ideias/${arquivada}/status`)
      .send({ para: 'arquivada', justificativa: 'Sem andamento' })
      .expect(200);
    await comentar(carla, arquivada, 'Ainda acho importante');

    const { body } = await ana
      .post('/api/ideias')
      .send({ titulo: 'Rascunho', categoriaId: ti })
      .expect(201);
    await carla.post(`/api/ideias/${body.numero}/comentarios`).send({ texto: 'Oi' }).expect(404);
    await ana.post(`/api/ideias/${body.numero}/comentarios`).send({ texto: 'Oi' }).expect(409);
  });

  it('Menções guardam quem foi mencionado; inativos viram texto simples', async () => {
    const numero = await novaIdeia();
    await sim.pool.query('update colaboradores set ativo = false where id = $1', [ids.joao]);

    const comentario = await comentar(
      carla,
      numero,
      `@[Bruno](${ids.bruno}) e @[João](${ids.joao}), o que acham?`,
    );
    expect(comentario.texto).toBe(`@[Bruno](${ids.bruno}) e @João, o que acham?`);
    const { rows } = await sim.pool.query(
      'select colaborador_id from mencoes where comentario_id = $1',
      [comentario.id],
    );
    expect(rows.map((r) => r.colaborador_id)).toEqual([ids.bruno]);

    await sim.pool.query('update colaboradores set ativo = true where id = $1', [ids.joao]);
  });

  it('quem escreveu edita (fica "editado") e remove (fica "comentário removido")', async () => {
    const numero = await novaIdeia();
    const comentario = await comentar(carla, numero, `Falar com @[Ana](${ids.ana})`);
    await comentar(ana, numero, 'Combinado', comentario.id);

    await bruno.patch(`/api/comentarios/${comentario.id}`).send({ texto: 'Invasão' }).expect(403);
    const editado = await carla
      .patch(`/api/comentarios/${comentario.id}`)
      .send({ texto: 'Falar com o RH' })
      .expect(200);
    expect(editado.body).toMatchObject({ texto: 'Falar com o RH', estado: 'publicado' });
    expect(editado.body.editadoEm).not.toBeNull();
    const { rows } = await sim.pool.query('select 1 from mencoes where comentario_id = $1', [
      comentario.id,
    ]);
    expect(rows).toHaveLength(0);

    await carla.delete(`/api/comentarios/${comentario.id}`).expect(204);
    await carla.delete(`/api/comentarios/${comentario.id}`).expect(409);
    const [removido] = await comentariosVistosPor(carla, numero);
    expect(removido).toMatchObject({ estado: 'removido', texto: null });
    // As Respostas continuam lá.
    expect(removido!.respostas.map((r) => r.texto)).toEqual(['Combinado']);
  });

  it('Avaliador oculta com motivo; o texto fica só para quem escreveu e quem modera', async () => {
    const numero = await novaIdeia();
    const comentario = await comentar(carla, numero, 'Comentário ofensivo');

    await ana
      .post(`/api/comentarios/${comentario.id}/ocultar`)
      .send({ motivo: 'Não gostei' })
      .expect(403);
    await bruno.post(`/api/comentarios/${comentario.id}/ocultar`).send({ motivo: '' }).expect(400);
    const oculto = await bruno
      .post(`/api/comentarios/${comentario.id}/ocultar`)
      .send({ motivo: 'Desrespeita as regras de convivência' })
      .expect(200);
    expect(oculto.body).toMatchObject({
      estado: 'oculto',
      texto: 'Comentário ofensivo',
      ocultacao: { motivo: 'Desrespeita as regras de convivência', por: { nome: 'Bruno' } },
    });

    const [paraAna] = await comentariosVistosPor(ana, numero);
    expect(paraAna).toMatchObject({ estado: 'oculto', texto: null });
    expect(paraAna!.ocultacao?.motivo).toBe('Desrespeita as regras de convivência');
    const [paraCarla] = await comentariosVistosPor(carla, numero);
    expect(paraCarla).toMatchObject({ texto: 'Comentário ofensivo' });
    expect(paraCarla!.permissoes).toMatchObject({ podeEditar: false, podeRemover: true });

    await carla
      .post(`/api/ideias/${numero}/comentarios`)
      .send({
        texto: 'Respondendo o oculto',
        respostaAId: comentario.id,
      })
      .expect(409);
  });

  it('Comentário de outra pessoa impede a Autora de excluir a Ideia Aberta', async () => {
    const numero = await novaIdeia();
    await comentar(ana, numero, 'Comentário da própria Autora não conta');
    expect((await ana.get(`/api/ideias/${numero}`).expect(200)).body.permissoes.podeExcluir).toBe(
      true,
    );

    const comentario = await comentar(carla, numero, 'Boa ideia');
    await ana.delete(`/api/ideias/${numero}`).expect(409);
    await carla.delete(`/api/comentarios/${comentario.id}`).expect(204);
    await ana.delete(`/api/ideias/${numero}`).expect(204);
  });

  it('Comentários recentes fazem a Ideia subir em Em alta', async () => {
    const categoria = (await admin.post('/api/categorias').send({ nome: 'Em alta' }).expect(201))
      .body.id;
    const quieta = await novaIdeia({ categoriaId: categoria, titulo: 'Quieta' });
    const discutida = await novaIdeia({ categoriaId: categoria, titulo: 'Discutida' });
    await sim.pool.query(
      `update ideias set publicada_em = now() - interval '30 days' where numero = $1`,
      [discutida],
    );
    await comentar(carla, discutida, 'Retomando esta discussão');
    await comentar(bruno, discutida, 'Vamos olhar no próximo comitê');

    const { body } = await carla.get('/api/ideias').query({ categoriaId: categoria }).expect(200);
    expect(body.itens.map((i: { numero: number }) => i.numero)).toEqual([discutida, quieta]);
  });

  it('qualquer Colaborador busca quem mencionar, sem diferenciar acentos', async () => {
    const { body } = await carla
      .get('/api/colaboradores/mencionaveis')
      .query({ busca: 'joao arau' })
      .expect(200);
    expect(body).toEqual([{ id: ids.joao, nome: 'João Araújo' }]);

    await sim.pool.query('update colaboradores set ativo = false where id = $1', [ids.joao]);
    await carla.get('/api/colaboradores/mencionaveis').query({ busca: 'joão' }).expect(200, []);
    // A listagem completa de Colaboradores continua restrita ao Administrador.
    await carla.get('/api/colaboradores').expect(403);
  });
});
