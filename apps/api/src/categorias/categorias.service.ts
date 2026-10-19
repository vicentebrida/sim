import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { ehViolacaoDeUnicidade } from '../database/erros';
import { avaliadores, type Categoria, categorias, colaboradores, ideias } from '../database/schema';

export interface CategoriaComAvaliadores extends Categoria {
  avaliadores: { id: string; nome: string }[];
}

const NOME_DUPLICADO = 'Já existe uma Categoria com este nome';

@Injectable()
export class CategoriasService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listar(filtro: {
    incluirInativas: boolean;
    id?: string;
  }): Promise<CategoriaComAvaliadores[]> {
    const lista = await this.db
      .select()
      .from(categorias)
      .where(
        and(
          filtro.incluirInativas ? undefined : eq(categorias.ativa, true),
          filtro.id ? eq(categorias.id, filtro.id) : undefined,
        ),
      )
      .orderBy(asc(categorias.nome));
    if (!lista.length) return [];

    const designacoes = await this.db
      .select({
        categoriaId: avaliadores.categoriaId,
        id: colaboradores.id,
        nome: colaboradores.nome,
      })
      .from(avaliadores)
      .innerJoin(colaboradores, eq(avaliadores.colaboradorId, colaboradores.id))
      .where(
        inArray(
          avaliadores.categoriaId,
          lista.map((categoria) => categoria.id),
        ),
      )
      .orderBy(asc(colaboradores.nome));

    return lista.map((categoria) => ({
      ...categoria,
      avaliadores: designacoes
        .filter((designacao) => designacao.categoriaId === categoria.id)
        .map(({ id, nome }) => ({ id, nome })),
    }));
  }

  async buscar(id: string): Promise<CategoriaComAvaliadores> {
    const [categoria] = await this.listar({ incluirInativas: true, id });
    if (!categoria) throw new NotFoundException('Categoria não encontrada');
    return categoria;
  }

  async criar(dados: { nome: string; descricao: string }) {
    try {
      const [categoria] = await this.db.insert(categorias).values(dados).returning();
      return { ...categoria!, avaliadores: [] };
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) throw new ConflictException(NOME_DUPLICADO);
      throw erro;
    }
  }

  async atualizar(id: string, dados: { nome?: string; descricao?: string; ativa?: boolean }) {
    try {
      const [atualizada] = await this.db
        .update(categorias)
        .set(dados)
        .where(eq(categorias.id, id))
        .returning({ id: categorias.id });
      if (!atualizada) throw new NotFoundException('Categoria não encontrada');
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) throw new ConflictException(NOME_DUPLICADO);
      throw erro;
    }
    return this.buscar(id);
  }

  /** Substitui o conjunto de Avaliadores da Categoria. Só Colaboradores ativos podem avaliar. */
  async definirAvaliadores(id: string, colaboradorIds: string[]) {
    await this.buscar(id);
    if (colaboradorIds.length) {
      const validos = await this.db
        .select({ id: colaboradores.id })
        .from(colaboradores)
        .where(and(inArray(colaboradores.id, colaboradorIds), eq(colaboradores.ativo, true)));
      if (validos.length !== colaboradorIds.length) {
        throw new BadRequestException('Avaliadores devem ser Colaboradores ativos');
      }
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(avaliadores).where(eq(avaliadores.categoriaId, id));
      if (colaboradorIds.length) {
        await tx
          .insert(avaliadores)
          .values(colaboradorIds.map((colaboradorId) => ({ categoriaId: id, colaboradorId })));
      }
    });
    return this.buscar(id);
  }

  /** Categorias que já receberam Ideias só podem ser desativadas. */
  async excluir(id: string) {
    await this.buscar(id);
    const [comIdeia] = await this.db
      .select({ id: ideias.id })
      .from(ideias)
      .where(eq(ideias.categoriaId, id))
      .limit(1);
    if (comIdeia) {
      throw new ConflictException('Esta Categoria já tem Ideias; desative-a em vez de excluir');
    }
    await this.db.delete(categorias).where(eq(categorias.id, id));
  }
}
