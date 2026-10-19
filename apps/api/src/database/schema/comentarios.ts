import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { colaboradores } from './colaboradores';
import { ideias } from './ideias';

export const comentarios = pgTable(
  'comentarios',
  {
    id: uuid().primaryKey().defaultRandom(),
    ideiaId: uuid()
      .notNull()
      .references(() => ideias.id, { onDelete: 'cascade' }),
    autorId: uuid()
      .notNull()
      .references(() => colaboradores.id),
    // Comentário respondido (um nível só: Respostas não são respondidas).
    respostaAId: uuid().references((): AnyPgColumn => comentarios.id),
    // Menções ficam marcadas como `@[Nome](id)`. Vazio depois de removido.
    texto: text().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    editadoEm: timestamp({ withTimezone: true }),
    // Removido por quem escreveu: aparece como "comentário removido", sem o texto.
    removidoEm: timestamp({ withTimezone: true }),
    // Comentário Oculto por Avaliador ou Administrador, com motivo.
    ocultadoEm: timestamp({ withTimezone: true }),
    ocultadoPorId: uuid().references(() => colaboradores.id),
    motivoDaOcultacao: text(),
  },
  (tabela) => [
    index().on(tabela.ideiaId, tabela.criadoEm),
    index().on(tabela.respostaAId),
    check(
      'comentarios_ocultacao_completa',
      sql`(${tabela.ocultadoEm} is null) = (${tabela.ocultadoPorId} is null) and (${tabela.ocultadoEm} is null) = (${tabela.motivoDaOcultacao} is null)`,
    ),
  ],
);

/** Colaboradores mencionados em cada Comentário (base das Notificações de Menção). */
export const mencoes = pgTable(
  'mencoes',
  {
    comentarioId: uuid()
      .notNull()
      .references(() => comentarios.id, { onDelete: 'cascade' }),
    colaboradorId: uuid()
      .notNull()
      .references(() => colaboradores.id),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.comentarioId, tabela.colaboradorId] }),
    index().on(tabela.colaboradorId),
  ],
);

export type Comentario = typeof comentarios.$inferSelect;
