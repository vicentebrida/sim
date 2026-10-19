import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { colaboradores } from './colaboradores';

export const sessoes = pgTable(
  'sessoes',
  {
    // SHA-256 do token do cookie; o token em si nunca é gravado.
    tokenHash: text().primaryKey(),
    colaboradorId: uuid()
      .notNull()
      .references(() => colaboradores.id, { onDelete: 'cascade' }),
    criadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiraEm: timestamp({ withTimezone: true }).notNull(),
  },
  (tabela) => [index().on(tabela.colaboradorId)],
);
