import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { collaborators } from './collaborators';

/**
 * Sensitive actions by Administrators (and by the system). Append-only: a database trigger
 * refuses updates and deletes, so the record cannot be rewritten by the application.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Null when the system acted by itself (e.g. automatic inactivation).
    actorId: uuid().references(() => collaborators.id),
    // Dotted name, e.g. `collaborator.anonymized`.
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    // Facts to understand the entry later, without personal data that was erased.
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.createdAt)],
);

export type AuditEntry = typeof auditLog.$inferSelect;
