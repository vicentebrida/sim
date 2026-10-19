import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, ne, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { CamposPersonalizadosService } from '../campos-personalizados/campos-personalizados.service';
import { DB, type Database } from '../database/database.module';
import {
  avaliadores,
  type Colaborador,
  categorias,
  colaboradores,
  curtidas,
  historicoDeIdeias,
  type Ideia,
  ideias,
} from '../database/schema';
import { normalizarValores, type Valores } from './dominio/campos';
import {
  type Ator,
  MEIA_VIDA_EM_ALTA_DIAS,
  type Ordem,
  podeVer,
  permissoes,
  type Status,
  validarCurtida,
  validarEdicao,
  validarExclusao,
  validarMudancaDeStatus,
  validarPublicacao,
  validarRecategorizacao,
} from './dominio/ideia';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface FiltroDeIdeias {
  status?: Status[];
  categoriaId?: string;
  autor?: 'eu';
  ordem: Ordem;
  pagina: number;
  porPagina: number;
}

const totalDeCurtidas = sql<number>`(select count(*) from ${curtidas} where ${curtidas.ideiaId} = ${ideias.id})::int`;

const curtiu = (colaborador: Colaborador) =>
  sql<boolean>`exists (select 1 from ${curtidas} where ${curtidas.ideiaId} = ${ideias.id} and ${curtidas.colaboradorId} = ${colaborador.id})`;

/** Peso de um acontecimento ocorrido em `momento`: 1 agora, metade a cada meia-vida. */
const peso = (momento: SQL) =>
  sql`exp(-ln(2) * least(extract(epoch from (now() - ${momento})) / ${MEIA_VIDA_EM_ALTA_DIAS * 86_400}, 1000))`;

// Comentários recentes também vão entrar nesta soma quando existirem (PRD §3.5).
const pontuacaoEmAlta = sql`(${peso(sql`coalesce(${ideias.publicadaEm}, ${ideias.criadaEm})`)} + coalesce((select sum(${peso(sql`${curtidas.em}`)}) from ${curtidas} where ${curtidas.ideiaId} = ${ideias.id}), 0))`;

const maisRecentes = [
  desc(sql`coalesce(${ideias.publicadaEm}, ${ideias.criadaEm})`),
  desc(ideias.numero),
];

const ORDENACAO: Record<Ordem, SQL[]> = {
  em_alta: [desc(pontuacaoEmAlta), ...maisRecentes],
  mais_curtidas: [desc(totalDeCurtidas), ...maisRecentes],
  mais_recentes: maisRecentes,
};

const iso = (data: Date | null) => data?.toISOString() ?? null;

@Injectable()
export class IdeiasService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly campos: CamposPersonalizadosService,
  ) {}

  // ---------- leitura ----------

  async listar(colaborador: Colaborador, filtro: FiltroDeIdeias) {
    const autor = alias(colaboradores, 'autor');
    const condicoes: (SQL | undefined)[] = [
      // Rascunhos só aparecem para o próprio Autor.
      or(ne(ideias.status, 'rascunho'), eq(ideias.autorId, colaborador.id)),
      filtro.status?.length
        ? inArray(ideias.status, filtro.status)
        : filtro.autor === 'eu'
          ? ne(ideias.status, 'arquivada')
          : and(ne(ideias.status, 'arquivada'), ne(ideias.status, 'rascunho')),
      filtro.categoriaId ? eq(ideias.categoriaId, filtro.categoriaId) : undefined,
      filtro.autor === 'eu' ? eq(ideias.autorId, colaborador.id) : undefined,
    ];
    const where = and(...condicoes);

    const [linhas, contagem] = await Promise.all([
      this.db
        .select({
          ideia: ideias,
          categoria: { id: categorias.id, nome: categorias.nome },
          autor: { id: autor.id, nome: autor.nome },
          curtidas: { total: totalDeCurtidas, curtiu: curtiu(colaborador) },
        })
        .from(ideias)
        .innerJoin(categorias, eq(ideias.categoriaId, categorias.id))
        .innerJoin(autor, eq(ideias.autorId, autor.id))
        .where(where)
        .orderBy(...ORDENACAO[filtro.ordem])
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(ideias).where(where),
    ]);

    return {
      itens: linhas.map(({ ideia, categoria, autor, curtidas }) => ({
        ...this.resumo(ideia),
        categoria,
        autor,
        curtidas,
      })),
      total: contagem[0]?.total ?? 0,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async detalhar(colaborador: Colaborador, numero: number) {
    const ideia = await this.buscar(numero);
    const ator = await this.ator(colaborador, ideia.categoriaId);
    if (!podeVer(ideia, ator)) throw new NotFoundException('Ideia não encontrada');

    const quemMudou = alias(colaboradores, 'quem_mudou');
    const [[categoria], [autor], campos, historico, original, estadoDasCurtidas, interacao] =
      await Promise.all([
        this.db
          .select({ id: categorias.id, nome: categorias.nome })
          .from(categorias)
          .where(eq(categorias.id, ideia.categoriaId)),
        this.db
          .select({ id: colaboradores.id, nome: colaboradores.nome })
          .from(colaboradores)
          .where(eq(colaboradores.id, ideia.autorId)),
        this.campos.listar({ incluirInativos: true }),
        this.db
          .select({
            evento: historicoDeIdeias,
            colaborador: { id: quemMudou.id, nome: quemMudou.nome },
          })
          .from(historicoDeIdeias)
          .innerJoin(quemMudou, eq(historicoDeIdeias.colaboradorId, quemMudou.id))
          .where(eq(historicoDeIdeias.ideiaId, ideia.id))
          .orderBy(asc(historicoDeIdeias.em)),
        ideia.ideiaOriginalId
          ? this.db
              .select({ numero: ideias.numero, titulo: ideias.titulo })
              .from(ideias)
              .where(eq(ideias.id, ideia.ideiaOriginalId))
          : Promise.resolve([]),
        this.estadoDasCurtidas(ideia, colaborador),
        this.interacaoDeOutros(ideia),
      ]);

    // Eventos de Categoria guardam ids; para exibir, troca pelos nomes.
    const idsDeCategoria = historico
      .filter(({ evento }) => evento.tipo === 'categoria')
      .flatMap(({ evento }) => [evento.de, evento.para])
      .filter((id): id is string => Boolean(id));
    const nomesDeCategoria = new Map(
      idsDeCategoria.length
        ? (
            await this.db
              .select({ id: categorias.id, nome: categorias.nome })
              .from(categorias)
              .where(inArray(categorias.id, idsDeCategoria))
          ).map(({ id, nome }) => [id, nome])
        : [],
    );
    const nomeDaCategoria = (id: string | null) => (id ? (nomesDeCategoria.get(id) ?? id) : null);

    const { podeVer: _, ...acoes } = permissoes(ideia, ator, interacao);
    return {
      ...this.resumo(ideia),
      editadaEm: iso(ideia.editadaEm),
      categoria: categoria!,
      autor: autor!,
      valores: ideia.valores,
      respostas: campos
        .filter((campo) => campo.id in ideia.valores)
        .map((campo) => ({
          campoId: campo.id,
          rotulo: campo.rotulo,
          tipo: campo.tipo,
          valor: ideia.valores[campo.id]!,
        })),
      curtidas: estadoDasCurtidas,
      ideiaOriginal: original[0] ?? null,
      historico: historico.map(({ evento, colaborador: quem }) => ({
        id: evento.id,
        tipo: evento.tipo,
        de: evento.tipo === 'categoria' ? nomeDaCategoria(evento.de) : evento.de,
        para: (evento.tipo === 'categoria' ? nomeDaCategoria(evento.para) : evento.para)!,
        justificativa: evento.justificativa,
        colaborador: quem,
        em: evento.em.toISOString(),
      })),
      permissoes: acoes,
    };
  }

  // ---------- escrita ----------

  async criar(
    colaborador: Colaborador,
    dados: { titulo: string; categoriaId: string; valores: Valores; publicar: boolean },
  ) {
    await this.exigirCategoriaAtiva(dados.categoriaId);
    const valores = normalizarValores(
      await this.definicoesDeCampos(),
      dados.valores,
      {},
      {
        exigirObrigatorios: dados.publicar,
      },
    );

    const numero = await this.db.transaction(async (tx) => {
      const agora = new Date();
      const [ideia] = await tx
        .insert(ideias)
        .values({
          titulo: dados.titulo,
          categoriaId: dados.categoriaId,
          autorId: colaborador.id,
          status: dados.publicar ? 'aberta' : 'rascunho',
          valores,
          publicadaEm: dados.publicar ? agora : null,
        })
        .returning();
      if (dados.publicar) await this.registrarPublicacao(tx, ideia!, colaborador);
      return ideia!.numero;
    });
    return this.detalhar(colaborador, numero);
  }

  async editar(
    colaborador: Colaborador,
    numero: number,
    dados: { titulo?: string; categoriaId?: string; valores?: Valores },
  ) {
    const ideia = await this.buscar(numero);
    validarEdicao(ideia, await this.ator(colaborador, ideia.categoriaId));
    if (dados.categoriaId && dados.categoriaId !== ideia.categoriaId) {
      await this.exigirCategoriaAtiva(dados.categoriaId);
    }
    const publicada = ideia.status !== 'rascunho';
    const valores = dados.valores
      ? normalizarValores(await this.definicoesDeCampos(), dados.valores, ideia.valores, {
          // Uma Ideia publicada continua precisando dos obrigatórios ao ser editada.
          exigirObrigatorios: publicada,
        })
      : undefined;

    await this.db
      .update(ideias)
      .set({
        titulo: dados.titulo,
        categoriaId: dados.categoriaId,
        valores,
        editadaEm: publicada ? new Date() : undefined,
      })
      .where(eq(ideias.id, ideia.id));
    return this.detalhar(colaborador, numero);
  }

  async publicar(colaborador: Colaborador, numero: number) {
    const ideia = await this.buscar(numero);
    validarPublicacao(ideia, await this.ator(colaborador, ideia.categoriaId));
    await this.exigirCategoriaAtiva(ideia.categoriaId);
    const campos = await this.definicoesDeCampos();
    const ativos = Object.fromEntries(
      Object.entries(ideia.valores).filter(([id]) => campos.some((c) => c.id === id && c.ativo)),
    );
    const valores = normalizarValores(campos, ativos, ideia.valores, { exigirObrigatorios: true });

    await this.db.transaction(async (tx) => {
      const agora = new Date();
      await tx
        .update(ideias)
        .set({ status: 'aberta', valores, publicadaEm: agora, statusAlteradoEm: agora })
        .where(eq(ideias.id, ideia.id));
      await this.registrarPublicacao(tx, ideia, colaborador);
    });
    return this.detalhar(colaborador, numero);
  }

  async mudarStatus(
    colaborador: Colaborador,
    numero: number,
    dados: { para: Status; justificativa: string; ideiaOriginalNumero?: number },
  ) {
    const ideia = await this.buscar(numero);
    const ideiaOriginal =
      dados.para === 'duplicada' && dados.ideiaOriginalNumero
        ? await this.buscar(dados.ideiaOriginalNumero).catch(() => undefined)
        : undefined;
    validarMudancaDeStatus(ideia, dados.para, await this.ator(colaborador, ideia.categoriaId), {
      justificativa: dados.justificativa,
      ideiaOriginal,
    });

    await this.db.transaction(async (tx) => {
      await tx
        .update(ideias)
        .set({
          status: dados.para,
          ideiaOriginalId: ideiaOriginal?.id ?? null,
          statusAlteradoEm: new Date(),
        })
        .where(eq(ideias.id, ideia.id));
      if (ideiaOriginal) await this.migrarCurtidas(tx, ideia, ideiaOriginal);
      await tx.insert(historicoDeIdeias).values({
        ideiaId: ideia.id,
        tipo: 'status',
        de: ideia.status,
        para: dados.para,
        justificativa: dados.justificativa,
        colaboradorId: colaborador.id,
      });
    });
    return this.detalhar(colaborador, numero);
  }

  async recategorizar(
    colaborador: Colaborador,
    numero: number,
    dados: { categoriaId: string; justificativa: string },
  ) {
    const ideia = await this.buscar(numero);
    validarRecategorizacao(
      ideia,
      await this.ator(colaborador, ideia.categoriaId),
      dados.justificativa,
    );
    if (dados.categoriaId === ideia.categoriaId) {
      throw new BadRequestException('A Ideia já está nesta Categoria');
    }
    await this.exigirCategoriaAtiva(dados.categoriaId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(ideias)
        .set({ categoriaId: dados.categoriaId })
        .where(eq(ideias.id, ideia.id));
      await tx.insert(historicoDeIdeias).values({
        ideiaId: ideia.id,
        tipo: 'categoria',
        de: ideia.categoriaId,
        para: dados.categoriaId,
        justificativa: dados.justificativa,
        colaboradorId: colaborador.id,
      });
    });
    return this.detalhar(colaborador, numero);
  }

  async excluir(colaborador: Colaborador, numero: number) {
    const ideia = await this.buscar(numero);
    validarExclusao(
      ideia,
      await this.ator(colaborador, ideia.categoriaId),
      await this.interacaoDeOutros(ideia),
    );
    await this.db.delete(ideias).where(eq(ideias.id, ideia.id));
  }

  // ---------- Curtidas ----------

  async curtir(colaborador: Colaborador, numero: number) {
    const ideia = await this.buscarVisivel(colaborador, numero);
    validarCurtida(ideia, await this.ator(colaborador, ideia.categoriaId));
    await this.db
      .insert(curtidas)
      .values({ ideiaId: ideia.id, colaboradorId: colaborador.id })
      .onConflictDoNothing();
    return this.estadoDasCurtidas(ideia, colaborador);
  }

  async descurtir(colaborador: Colaborador, numero: number) {
    const ideia = await this.buscarVisivel(colaborador, numero);
    validarCurtida(ideia, await this.ator(colaborador, ideia.categoriaId));
    await this.db
      .delete(curtidas)
      .where(and(eq(curtidas.ideiaId, ideia.id), eq(curtidas.colaboradorId, colaborador.id)));
    return this.estadoDasCurtidas(ideia, colaborador);
  }

  /** Quem curtiu, da Curtida mais recente para a mais antiga (a Curtida é sempre identificada). */
  async listarCurtidas(colaborador: Colaborador, numero: number) {
    const ideia = await this.buscarVisivel(colaborador, numero);
    const linhas = await this.db
      .select({ colaborador: { id: colaboradores.id, nome: colaboradores.nome }, em: curtidas.em })
      .from(curtidas)
      .innerJoin(colaboradores, eq(curtidas.colaboradorId, colaboradores.id))
      .where(eq(curtidas.ideiaId, ideia.id))
      .orderBy(desc(curtidas.em));
    return linhas.map(({ colaborador: quem, em }) => ({ colaborador: quem, em: em.toISOString() }));
  }

  // ---------- apoio ----------

  private resumo(ideia: Ideia) {
    return {
      id: ideia.id,
      numero: ideia.numero,
      titulo: ideia.titulo,
      status: ideia.status,
      criadaEm: ideia.criadaEm.toISOString(),
      publicadaEm: iso(ideia.publicadaEm),
    };
  }

  private async buscar(numero: number): Promise<Ideia> {
    const [ideia] = await this.db.select().from(ideias).where(eq(ideias.numero, numero));
    if (!ideia) throw new NotFoundException('Ideia não encontrada');
    return ideia;
  }

  private async buscarVisivel(colaborador: Colaborador, numero: number) {
    const ideia = await this.buscar(numero);
    if (!podeVer(ideia, await this.ator(colaborador, ideia.categoriaId))) {
      throw new NotFoundException('Ideia não encontrada');
    }
    return ideia;
  }

  private async estadoDasCurtidas(ideia: Ideia, colaborador: Colaborador) {
    const [estado] = await this.db
      .select({ total: totalDeCurtidas, curtiu: curtiu(colaborador) })
      .from(ideias)
      .where(eq(ideias.id, ideia.id));
    return estado ?? { total: 0, curtiu: false };
  }

  /** Curtidas de outras pessoas impedem o Autor de excluir a Ideia (o Autor não curte a própria). */
  private async interacaoDeOutros(ideia: Ideia) {
    const [curtida] = await this.db
      .select({ ideiaId: curtidas.ideiaId })
      .from(curtidas)
      .where(eq(curtidas.ideiaId, ideia.id))
      .limit(1);
    return { temInteracaoDeOutros: Boolean(curtida) };
  }

  /**
   * Curtidas da Duplicada passam para a Ideia Original, sem contar em dobro quem já curtiu as duas
   * e sem dar ao Autor da Original uma Curtida na própria Ideia.
   */
  private async migrarCurtidas(tx: Transacao, duplicada: Ideia, original: Ideia) {
    await tx.execute(sql`
      insert into ${curtidas} (ideia_id, colaborador_id, em)
      select ${original.id}, colaborador_id, em from ${curtidas}
      where ideia_id = ${duplicada.id} and colaborador_id <> ${original.autorId}
      on conflict do nothing`);
    await tx.delete(curtidas).where(eq(curtidas.ideiaId, duplicada.id));
  }

  private async ator(colaborador: Colaborador, categoriaId: string): Promise<Ator> {
    const [designacao] = await this.db
      .select({ colaboradorId: avaliadores.colaboradorId })
      .from(avaliadores)
      .where(
        and(
          eq(avaliadores.categoriaId, categoriaId),
          eq(avaliadores.colaboradorId, colaborador.id),
        ),
      );
    return {
      id: colaborador.id,
      administrador: colaborador.administrador,
      avaliaCategoria: Boolean(designacao),
    };
  }

  private async definicoesDeCampos() {
    return this.campos.listar({ incluirInativos: true });
  }

  private async exigirCategoriaAtiva(categoriaId: string) {
    const [categoria] = await this.db
      .select({ ativa: categorias.ativa })
      .from(categorias)
      .where(eq(categorias.id, categoriaId));
    if (!categoria?.ativa) throw new BadRequestException('Categoria inexistente ou desativada');
  }

  private async registrarPublicacao(tx: Transacao, ideia: Ideia, autor: Colaborador) {
    await tx.insert(historicoDeIdeias).values({
      ideiaId: ideia.id,
      tipo: 'status',
      de: null,
      para: 'aberta',
      colaboradorId: autor.id,
    });
  }
}
