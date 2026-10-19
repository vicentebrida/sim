import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const colaboradores = pgTable('colaboradores', {
  id: uuid().primaryKey().defaultRandom(),
  nome: text().notNull(),
  // Sempre em minúsculas: é a chave de vínculo entre conta local, SSO e SIM_ADMIN_EMAILS.
  email: text().notNull().unique(),
  senhaHash: text(),
  deveTrocarSenha: boolean().notNull().default(false),
  ssoSubject: text().unique(),
  departamento: text(),
  fotoUrl: text(),
  administrador: boolean().notNull().default(false),
  ativo: boolean().notNull().default(true),
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ultimoLoginEm: timestamp({ withTimezone: true }),
});

export type Colaborador = typeof colaboradores.$inferSelect;
