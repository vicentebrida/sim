import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { colaboradores } from './colaboradores';
import { ideias } from './ideias';

/** Uma Curtida por Colaborador por Ideia, sempre identificada. */
export const curtidas = pgTable(
  'curtidas',
  {
    ideiaId: uuid()
      .notNull()
      .references(() => ideias.id, { onDelete: 'cascade' }),
    colaboradorId: uuid()
      .notNull()
      .references(() => colaboradores.id),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.ideiaId, tabela.colaboradorId] }),
    index().on(tabela.colaboradorId),
  ],
);
