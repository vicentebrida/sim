import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { colaboradores } from './colaboradores';

export const categorias = pgTable(
  'categorias',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    // Exibida no formulário da Ideia para ajudar o Colaborador a escolher a Categoria.
    descricao: text().notNull().default(''),
    // Categorias com Ideias são desativadas, nunca excluídas.
    ativa: boolean().notNull().default(true),
    criadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [uniqueIndex('categorias_nome_unico').on(sql`lower(${tabela.nome})`)],
);

export const avaliadores = pgTable(
  'avaliadores',
  {
    categoriaId: uuid()
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
    colaboradorId: uuid()
      .notNull()
      .references(() => colaboradores.id, { onDelete: 'cascade' }),
    designadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.categoriaId, tabela.colaboradorId] }),
    index().on(tabela.colaboradorId),
  ],
);

export type Categoria = typeof categorias.$inferSelect;
