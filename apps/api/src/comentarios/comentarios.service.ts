import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Database } from '../database/database.module';
import {
  type Colaborador,
  type Comentario,
  colaboradores,
  comentarios,
  mencoes,
} from '../database/schema';
import type { Ator, IdeiaParaRegras } from '../ideias/dominio/ideia';
import { IdeiasService } from '../ideias/ideias.service';
import {
  type ComentarioParaRegras,
  permissoesDoComentario,
  podeLerTexto,
  validarEdicaoDeComentario,
  validarNovoComentario,
  validarOcultacao,
  validarRemocaoDeComentario,
} from './dominio/comentario';
import { idsMencionados, normalizarMencoes } from './dominio/mencoes';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

type Referencia = { id: string; nome: string };
type ComentarioComNomes = {
  comentario: Comentario;
  autor: Referencia;
  ocultadoPor: Referencia | null;
};

const paraRegras = (comentario: Comentario): ComentarioParaRegras => ({
  autorId: comentario.autorId,
  respostaAId: comentario.respostaAId,
  removido: comentario.removidoEm !== null,
  oculto: comentario.ocultadoEm !== null,
});

@Injectable()
export class ComentariosService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ideias: IdeiasService,
  ) {}

  /** Comentários da Ideia em ordem cronológica, cada um com suas Respostas. */
  async listar(colaborador: Colaborador, numero: number) {
    const { ideia, ator } = await this.ideias.acessar(colaborador, { numero });
    const linhas = await this.consultar().where(eq(comentarios.ideiaId, ideia.id));

    const respostas = new Map<string, ComentarioComNomes[]>();
    for (const linha of linhas) {
      const pai = linha.comentario.respostaAId;
      if (pai) respostas.set(pai, [...(respostas.get(pai) ?? []), linha]);
    }
    return linhas
      .filter((linha) => !linha.comentario.respostaAId)
      .map((linha) => ({
        ...this.exibir(linha, ideia, ator),
        respostas: (respostas.get(linha.comentario.id) ?? []).map((resposta) =>
          this.exibir(resposta, ideia, ator),
        ),
      }));
  }

  async criar(
    colaborador: Colaborador,
    numero: number,
    dados: { texto: string; respostaAId?: string },
  ) {
    const { ideia, ator } = await this.ideias.acessar(colaborador, { numero });
    const respondido = dados.respostaAId
      ? await this.buscar(dados.respostaAId, ideia.id)
      : undefined;
    validarNovoComentario(ideia, respondido && paraRegras(respondido));

    const id = await this.db.transaction(async (tx) => {
      const { texto, mencionados } = await this.prepararTexto(tx, dados.texto);
      const [comentario] = await tx
        .insert(comentarios)
        .values({
          ideiaId: ideia.id,
          autorId: colaborador.id,
          respostaAId: respondido?.id ?? null,
          texto,
        })
        .returning({ id: comentarios.id });
      await this.registrarMencoes(tx, comentario!.id, mencionados);
      return comentario!.id;
    });
    return this.detalhar(id, ideia, ator);
  }

  async editar(colaborador: Colaborador, id: string, dados: { texto: string }) {
    const { comentario, ideia, ator } = await this.acessar(colaborador, id);
    validarEdicaoDeComentario(paraRegras(comentario), ator);

    await this.db.transaction(async (tx) => {
      const { texto, mencionados } = await this.prepararTexto(tx, dados.texto);
      await tx
        .update(comentarios)
        .set({ texto, editadoEm: new Date() })
        .where(eq(comentarios.id, id));
      await tx.delete(mencoes).where(eq(mencoes.comentarioId, id));
      await this.registrarMencoes(tx, id, mencionados);
    });
    return this.detalhar(id, ideia, ator);
  }

  /** Fica "comentário removido": o texto e as Menções são apagados, as Respostas permanecem. */
  async remover(colaborador: Colaborador, id: string) {
    const { comentario, ator } = await this.acessar(colaborador, id);
    validarRemocaoDeComentario(paraRegras(comentario), ator);

    await this.db.transaction(async (tx) => {
      await tx
        .update(comentarios)
        .set({ texto: '', removidoEm: new Date() })
        .where(eq(comentarios.id, id));
      await tx.delete(mencoes).where(eq(mencoes.comentarioId, id));
    });
  }

  async ocultar(colaborador: Colaborador, id: string, dados: { motivo: string }) {
    const { comentario, ideia, ator } = await this.acessar(colaborador, id);
    validarOcultacao(paraRegras(comentario), ideia, ator, dados.motivo);

    await this.db
      .update(comentarios)
      .set({
        ocultadoEm: new Date(),
        ocultadoPorId: colaborador.id,
        motivoDaOcultacao: dados.motivo,
      })
      .where(eq(comentarios.id, id));
    return this.detalhar(id, ideia, ator);
  }

  // ---------- apoio ----------

  private consultar() {
    const autor = alias(colaboradores, 'autor');
    const ocultadoPor = alias(colaboradores, 'ocultado_por');
    return this.db
      .select({
        comentario: comentarios,
        autor: { id: autor.id, nome: autor.nome },
        ocultadoPor: { id: ocultadoPor.id, nome: ocultadoPor.nome },
      })
      .from(comentarios)
      .innerJoin(autor, eq(comentarios.autorId, autor.id))
      .leftJoin(ocultadoPor, eq(comentarios.ocultadoPorId, ocultadoPor.id))
      .orderBy(asc(comentarios.criadoEm))
      .$dynamic();
  }

  private async detalhar(id: string, ideia: IdeiaParaRegras, ator: Ator) {
    const [linha] = await this.consultar().where(eq(comentarios.id, id));
    return { ...this.exibir(linha!, ideia, ator), respostas: [] };
  }

  private exibir(
    { comentario, autor, ocultadoPor }: ComentarioComNomes,
    ideia: IdeiaParaRegras,
    ator: Ator,
  ) {
    const regras = paraRegras(comentario);
    const estado = regras.removido ? 'removido' : regras.oculto ? 'oculto' : 'publicado';
    return {
      id: comentario.id,
      autor,
      texto: podeLerTexto(regras, ideia, ator) ? comentario.texto : null,
      estado,
      criadoEm: comentario.criadoEm.toISOString(),
      editadoEm: comentario.editadoEm?.toISOString() ?? null,
      ocultacao:
        estado === 'oculto' && ocultadoPor && comentario.ocultadoEm
          ? {
              motivo: comentario.motivoDaOcultacao ?? '',
              por: ocultadoPor,
              em: comentario.ocultadoEm.toISOString(),
            }
          : null,
      permissoes: permissoesDoComentario(regras, ideia, ator),
    } as const;
  }

  private async buscar(id: string, ideiaId?: string) {
    const [comentario] = await this.db
      .select()
      .from(comentarios)
      .where(
        ideiaId
          ? and(eq(comentarios.id, id), eq(comentarios.ideiaId, ideiaId))
          : eq(comentarios.id, id),
      );
    if (!comentario) throw new NotFoundException('Comentário não encontrado');
    return comentario;
  }

  private async acessar(colaborador: Colaborador, id: string) {
    const comentario = await this.buscar(id);
    const { ideia, ator } = await this.ideias.acessar(colaborador, { id: comentario.ideiaId });
    return { comentario, ideia, ator };
  }

  /** Só Colaboradores ativos podem ser mencionados; as demais marcações viram texto simples. */
  private async prepararTexto(tx: Transacao, texto: string) {
    const ids = idsMencionados(texto);
    const mencionaveis = ids.length
      ? await tx
          .select({ id: colaboradores.id, nome: colaboradores.nome })
          .from(colaboradores)
          .where(and(inArray(colaboradores.id, ids), eq(colaboradores.ativo, true)))
      : [];
    return normalizarMencoes(texto, new Map(mencionaveis.map(({ id, nome }) => [id, nome])));
  }

  private async registrarMencoes(tx: Transacao, comentarioId: string, mencionados: string[]) {
    if (!mencionados.length) return;
    await tx
      .insert(mencoes)
      .values(mencionados.map((colaboradorId) => ({ comentarioId, colaboradorId })));
  }
}
