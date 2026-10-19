import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AppDeTeste,
  criarApp,
  criarColaborador,
  entrarComoAdministrador,
} from './support/app';

type Navegador = ReturnType<AppDeTeste['navegador']>;

describe('Ideias', () => {
  let sim: AppDeTeste;
  let admin: Navegador;
  let ana: Navegador; // Autora
  let bruno: Navegador; // Avaliador de TI
  let carla: Navegador; // Colega sem papel
  let ti: string;
  let processos: string;
  let campo: { situacao: string; proposta: string; beneficio: string };

  const completa = () => ({
    [campo.situacao]: 'O relatório de vendas leva 2 horas para gerar',
    [campo.proposta]: 'Agendar a geração durante a madrugada',
  });

  async function novaIdeia(quem: Navegador, dados: Record<string, unknown> = {}) {
    const response = await quem
      .post('/api/ideias')
      .send({
        titulo: 'Relatório mais rápido',
        categoriaId: ti,
        valores: completa(),
        publicar: true,
        ...dados,
      })
      .expect(201);
    return response.body as { numero: number; status: string };
  }

  beforeAll(async () => {
    sim = await criarApp();
    admin = await entrarComoAdministrador(sim);
    ana = (await criarColaborador(sim, admin, 'Ana')).navegador;
    const avaliador = await criarColaborador(sim, admin, 'Bruno');
    bruno = avaliador.navegador;
    carla = (await criarColaborador(sim, admin, 'Carla')).navegador;

    ti = (await admin.post('/api/categorias').send({ nome: 'TI' }).expect(201)).body.id;
    processos = (await admin.post('/api/categorias').send({ nome: 'Processos' }).expect(201)).body
      .id;
    await admin
      .put(`/api/categorias/${ti}/avaliadores`)
      .send({ colaboradorIds: [avaliador.id] })
      .expect(200);

    const campos = (await ana.get('/api/campos-personalizados').expect(200)).body as {
      id: string;
      rotulo: string;
    }[];
    const porRotulo = (rotulo: string) => campos.find((c) => c.rotulo === rotulo)!.id;
    campo = {
      situacao: porRotulo('Situação atual'),
      proposta: porRotulo('Proposta'),
      beneficio: porRotulo('Benefício esperado'),
    };
  });

  afterAll(() => sim.fechar());

  describe('Rascunho e publicação', () => {
    it('Rascunho pode estar incompleto e só a Autora o vê', async () => {
      const { body } = await ana
        .post('/api/ideias')
        .send({ titulo: 'Ideia em construção', categoriaId: ti })
        .expect(201);
      expect(body.status).toBe('rascunho');

      await carla.get(`/api/ideias/${body.numero}`).expect(404);
      const listaDaCarla = await carla.get('/api/ideias').expect(200);
      expect(listaDaCarla.body.itens.map((i: { numero: number }) => i.numero)).not.toContain(
        body.numero,
      );
      const minhas = await ana.get('/api/ideias?autor=eu').expect(200);
      expect(minhas.body.itens.map((i: { numero: number }) => i.numero)).toContain(body.numero);
    });

    it('publicar exige os campos obrigatórios, apontando quais faltam', async () => {
      const { body } = await ana
        .post('/api/ideias')
        .send({
          titulo: 'Rascunho incompleto',
          categoriaId: ti,
          valores: { [campo.situacao]: 'Algo' },
        })
        .expect(201);

      const falha = await ana.post(`/api/ideias/${body.numero}/publicar`).expect(400);
      expect(falha.body).toMatchObject({
        codigo: 'CAMPOS_INVALIDOS',
        detalhes: { [campo.proposta]: 'Campo obrigatório' },
      });

      await ana.patch(`/api/ideias/${body.numero}`).send({ valores: completa() }).expect(200);
      const publicada = await ana.post(`/api/ideias/${body.numero}/publicar`).expect(200);
      expect(publicada.body).toMatchObject({ status: 'aberta', editadaEm: null });
      expect(publicada.body.historico).toEqual([
        expect.objectContaining({ tipo: 'status', de: null, para: 'aberta', justificativa: null }),
      ]);
      expect(publicada.body.respostas.map((r: { rotulo: string }) => r.rotulo)).toEqual([
        'Situação atual',
        'Proposta',
      ]);

      await carla.get(`/api/ideias/${body.numero}`).expect(200);
    });

    it('não aceita Categoria desativada', async () => {
      const { body: antiga } = await admin
        .post('/api/categorias')
        .send({ nome: 'Antiga' })
        .expect(201);
      await admin.patch(`/api/categorias/${antiga.id}`).send({ ativa: false }).expect(200);
      await ana
        .post('/api/ideias')
        .send({ titulo: 'X', categoriaId: antiga.id, valores: completa(), publicar: true })
        .expect(400);
    });
  });

  describe('avaliação', () => {
    it('Avaliador da Categoria leva a Ideia adiante, sempre com justificativa', async () => {
      const { numero } = await novaIdeia(ana);

      const paraBruno = await bruno.get(`/api/ideias/${numero}`).expect(200);
      expect(paraBruno.body.permissoes.transicoes).toEqual([
        'em_analise',
        'duplicada',
        'arquivada',
      ]);

      await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'em_analise', justificativa: ' ' })
        .expect(400);
      const emAnalise = await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'em_analise', justificativa: 'Vamos medir o tempo atual' })
        .expect(200);
      expect(emAnalise.body.status).toBe('em_analise');
      expect(emAnalise.body.historico.at(-1)).toMatchObject({
        de: 'aberta',
        para: 'em_analise',
        justificativa: 'Vamos medir o tempo atual',
        colaborador: { nome: 'Bruno' },
      });

      // Transição fora do ciclo
      const pulo = await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'concluida', justificativa: 'Pular etapas' })
        .expect(409);
      expect(pulo.body.codigo).toBe('TRANSICAO_INVALIDA');
    });

    it('colegas e a própria Autora não mudam o Status', async () => {
      const { numero } = await novaIdeia(ana);
      for (const quem of [carla, ana]) {
        const resposta = await quem
          .post(`/api/ideias/${numero}/status`)
          .send({ para: 'em_analise', justificativa: 'Quero' })
          .expect(403);
        expect(resposta.body.codigo).toBe('SEM_PERMISSAO');
      }
    });

    it('Avaliador não avalia a própria Ideia; o Administrador pode', async () => {
      const { numero } = await novaIdeia(bruno);
      await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'em_analise', justificativa: 'Minha' })
        .expect(403);
      await admin
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'em_analise', justificativa: 'Assumido pela administração' })
        .expect(200);
    });

    it('a partir de Em análise o texto fica travado para a Autora', async () => {
      const { numero } = await novaIdeia(ana);
      await ana.patch(`/api/ideias/${numero}`).send({ titulo: 'Ainda posso mudar' }).expect(200);
      await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'em_analise', justificativa: 'Começando' })
        .expect(200);
      await ana.patch(`/api/ideias/${numero}`).send({ titulo: 'Mudar depois' }).expect(409);
    });

    it('edição depois de publicada marca a Ideia como editada', async () => {
      const { numero } = await novaIdeia(ana);
      const editada = await ana
        .patch(`/api/ideias/${numero}`)
        .send({ titulo: 'Novo título' })
        .expect(200);
      expect(editada.body.editadaEm).not.toBeNull();
    });

    it('Duplicada aponta para a Ideia Original', async () => {
      const original = await novaIdeia(carla, { titulo: 'Original' });
      const { numero } = await novaIdeia(ana);

      await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'duplicada', justificativa: 'Já existe' })
        .expect(400);
      const duplicada = await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({
          para: 'duplicada',
          justificativa: 'Já existe',
          ideiaOriginalNumero: original.numero,
        })
        .expect(200);
      expect(duplicada.body).toMatchObject({
        status: 'duplicada',
        ideiaOriginal: { numero: original.numero, titulo: 'Original' },
        permissoes: { transicoes: [] },
      });
    });

    it('recategorizar registra o Histórico e muda quem avalia', async () => {
      const { numero } = await novaIdeia(ana);
      await carla
        .post(`/api/ideias/${numero}/categoria`)
        .send({ categoriaId: processos, justificativa: 'x' })
        .expect(403);

      const movida = await bruno
        .post(`/api/ideias/${numero}/categoria`)
        .send({ categoriaId: processos, justificativa: 'É um ajuste de processo, não de sistema' })
        .expect(200);
      expect(movida.body.categoria).toEqual({ id: processos, nome: 'Processos' });
      expect(movida.body.historico.at(-1)).toMatchObject({
        tipo: 'categoria',
        de: 'TI',
        para: 'Processos',
      });

      // Processos não tem Avaliadores: Bruno perde o poder sobre a Ideia, que fica com os Administradores.
      await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'em_analise', justificativa: 'x' })
        .expect(403);
      await admin
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'em_analise', justificativa: 'Administração assume' })
        .expect(200);
    });
  });

  describe('listagem', () => {
    it('Arquivadas saem da listagem padrão, mas aparecem no filtro', async () => {
      const { numero } = await novaIdeia(ana, { titulo: 'Vai ser arquivada' });
      await bruno
        .post(`/api/ideias/${numero}/status`)
        .send({ para: 'arquivada', justificativa: 'Sem relevância hoje' })
        .expect(200);

      const padrao = await carla.get('/api/ideias?porPagina=50').expect(200);
      expect(padrao.body.itens.map((i: { numero: number }) => i.numero)).not.toContain(numero);
      const arquivadas = await carla.get('/api/ideias?status=arquivada').expect(200);
      expect(arquivadas.body.itens.map((i: { numero: number }) => i.numero)).toContain(numero);
    });

    it('filtra por Categoria e pagina', async () => {
      const pagina = await carla
        .get(`/api/ideias?categoriaId=${ti}&porPagina=2&pagina=1`)
        .expect(200);
      expect(pagina.body.itens).toHaveLength(2);
      expect(pagina.body.total).toBeGreaterThan(2);
      expect(
        pagina.body.itens.every((i: { categoria: { id: string } }) => i.categoria.id === ti),
      ).toBe(true);
    });
  });

  describe('exclusão', () => {
    it('Autora exclui uma Ideia Aberta, mas não uma já em análise', async () => {
      const aberta = await novaIdeia(ana);
      await carla.delete(`/api/ideias/${aberta.numero}`).expect(403);
      await ana.delete(`/api/ideias/${aberta.numero}`).expect(204);
      await ana.get(`/api/ideias/${aberta.numero}`).expect(404);

      const emAnalise = await novaIdeia(ana);
      await bruno
        .post(`/api/ideias/${emAnalise.numero}/status`)
        .send({ para: 'em_analise', justificativa: 'ok' })
        .expect(200);
      await ana.delete(`/api/ideias/${emAnalise.numero}`).expect(409);
    });

    it('Categoria com Ideias não pode ser excluída, só desativada', async () => {
      await admin.delete(`/api/categorias/${ti}`).expect(409);
      const { body: vazia } = await admin
        .post('/api/categorias')
        .send({ nome: 'Vazia' })
        .expect(201);
      await admin.delete(`/api/categorias/${vazia.id}`).expect(204);
    });
  });

  describe('Campos Personalizados', () => {
    it('a instalação começa com Situação atual, Proposta e Benefício esperado', async () => {
      const { body } = await carla.get('/api/campos-personalizados').expect(200);
      expect(
        body.map((c: { rotulo: string; obrigatorio: boolean }) => [c.rotulo, c.obrigatorio]),
      ).toEqual([
        ['Situação atual', true],
        ['Proposta', true],
        ['Benefício esperado', false],
      ]);
    });

    it('Administrador cria campos de seleção, com opções', async () => {
      await admin
        .post('/api/campos-personalizados')
        .send({ rotulo: 'Área', tipo: 'selecao_unica' })
        .expect(400);
      await carla
        .post('/api/campos-personalizados')
        .send({ rotulo: 'Área', tipo: 'selecao_unica', opcoes: ['Fábrica', 'Escritório'] })
        .expect(403);
      const { body } = await admin
        .post('/api/campos-personalizados')
        .send({ rotulo: 'Área', tipo: 'selecao_unica', opcoes: ['Fábrica', 'Escritório'] })
        .expect(201);
      expect(body).toMatchObject({ ordem: 4, ativo: true });

      const invalida = await ana
        .post('/api/ideias')
        .send({ titulo: 'Com área', categoriaId: ti, valores: { ...completa(), [body.id]: 'Lua' } })
        .expect(400);
      expect(invalida.body.detalhes).toEqual({ [body.id]: 'Opção inválida' });
    });

    it('campo já usado em Ideias não é excluído; desativado, o valor continua na Ideia', async () => {
      const { numero } = await novaIdeia(ana, {
        valores: { ...completa(), [campo.beneficio]: 'Economia de 2h por dia' },
      });
      await admin.delete(`/api/campos-personalizados/${campo.beneficio}`).expect(409);
      await admin
        .patch(`/api/campos-personalizados/${campo.beneficio}`)
        .send({ ativo: false })
        .expect(200);

      const ideia = await carla.get(`/api/ideias/${numero}`).expect(200);
      expect(ideia.body.respostas).toContainEqual(
        expect.objectContaining({ rotulo: 'Benefício esperado', valor: 'Economia de 2h por dia' }),
      );
      const ativos = await carla.get('/api/campos-personalizados').expect(200);
      expect(ativos.body.map((c: { rotulo: string }) => c.rotulo)).not.toContain(
        'Benefício esperado',
      );

      await admin
        .patch(`/api/campos-personalizados/${campo.beneficio}`)
        .send({ ativo: true })
        .expect(200);
    });

    it('Administrador reordena os campos', async () => {
      const { body: todos } = await admin
        .get('/api/campos-personalizados?incluirInativos=true')
        .expect(200);
      const invertidos = [...todos].reverse().map((c: { id: string }) => c.id);
      const { body } = await admin
        .put('/api/campos-personalizados/ordem')
        .send({ ids: invertidos })
        .expect(200);
      expect(body.map((c: { id: string }) => c.id)).toEqual(invertidos);
      await admin
        .put('/api/campos-personalizados/ordem')
        .send({ ids: invertidos.slice(1) })
        .expect(400);
    });
  });
});
