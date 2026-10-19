import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { collaborators } from './collaborators';

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 of the cookie token; the token itself is never stored.
    tokenHash: text().primaryKey(),
    collaboratorId: uuid()
      .notNull()
      .references(() => collaborators.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index().on(table.collaboratorId)],
);
