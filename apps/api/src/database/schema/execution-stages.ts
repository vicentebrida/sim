import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Steps inside the In progress Status (ADR-0004), one list for the whole installation. Only
 * informative: an Idea can go to any step, in any order, and the Status rules do not change.
 */
export const executionStages = pgTable(
  'execution_stages',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    position: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('execution_stages_name_unique').on(sql`lower(${table.name})`)],
);

export type ExecutionStage = typeof executionStages.$inferSelect;
