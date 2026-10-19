import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { TipoDeCampo, Valores } from '../../ideias/dominio/campos';
import type { Status } from '../../ideias/dominio/ideia';
import { categorias } from './categorias';
import { colaboradores } from './colaboradores';

export const camposPersonalizados = pgTable('campos_personalizados', {
  id: uuid().primaryKey().defaultRandom(),
  rotulo: text().notNull(),
  ajuda: text().notNull().default(''),
  tipo: text().$type<TipoDeCampo>().notNull(),
  obrigatorio: boolean().notNull().default(false),
  opcoes: jsonb().$type<string[]>().notNull().default([]),
  // Só campos de texto: o conteúdo entra na detecção de Ideias Semelhantes.
  usarNaDeteccao: boolean().notNull().default(false),
  ordem: integer().notNull().default(0),
  // Campo já preenchido em alguma Ideia só pode ser desativado, nunca excluído.
  ativo: boolean().notNull().default(true),
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const ideias = pgTable(
  'ideias',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Número amigável para citar e usar na URL ("Ideia #42").
    numero: integer().generatedAlwaysAsIdentity().notNull().unique(),
    titulo: text().notNull(),
    categoriaId: uuid()
      .notNull()
      .references(() => categorias.id),
    autorId: uuid()
      .notNull()
      .references(() => colaboradores.id),
    status: text().$type<Status>().notNull(),
    // Valores dos Campos Personalizados, indexados pelo id do campo.
    valores: jsonb().$type<Valores>().notNull().default({}),
    ideiaOriginalId: uuid().references((): AnyPgColumn => ideias.id),
    criadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publicadaEm: timestamp({ withTimezone: true }),
    // Última edição do Autor depois de publicada (a Ideia aparece como "editada").
    editadaEm: timestamp({ withTimezone: true }),
    statusAlteradoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    index().on(tabela.status),
    index().on(tabela.categoriaId),
    index().on(tabela.autorId),
    index().on(tabela.publicadaEm),
    check(
      'ideias_status_valido',
      sql`${tabela.status} in ('rascunho','aberta','em_analise','aprovada','em_execucao','concluida','recusada','duplicada','arquivada')`,
    ),
    check(
      'ideias_duplicada_tem_original',
      sql`(${tabela.status} = 'duplicada') = (${tabela.ideiaOriginalId} is not null)`,
    ),
  ],
);

export type TipoDeEvento = 'status' | 'categoria';

/** Histórico: mudanças de Status e de Categoria, com quem mudou e a justificativa. */
export const historicoDeIdeias = pgTable(
  'historico_de_ideias',
  {
    id: uuid().primaryKey().defaultRandom(),
    ideiaId: uuid()
      .notNull()
      .references(() => ideias.id, { onDelete: 'cascade' }),
    tipo: text().$type<TipoDeEvento>().notNull(),
    // Status ou id de Categoria, conforme o tipo. `de` é nulo na publicação.
    de: text(),
    para: text().notNull(),
    justificativa: text(),
    colaboradorId: uuid()
      .notNull()
      .references(() => colaboradores.id),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index().on(tabela.ideiaId, tabela.em)],
);

export type CampoPersonalizado = typeof camposPersonalizados.$inferSelect;
export type Ideia = typeof ideias.$inferSelect;
