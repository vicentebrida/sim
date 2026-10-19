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
import { collaborators } from './collaborators';

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    // Shown on the Idea form to help the Collaborator pick the Category.
    description: text().notNull().default(''),
    // Categories with Ideas are deactivated, never deleted.
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('categories_name_unique').on(sql`lower(${table.name})`)],
);

/** Reviewers assigned to each Category. */
export const reviewers = pgTable(
  'reviewers',
  {
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    collaboratorId: uuid()
      .notNull()
      .references(() => collaborators.id, { onDelete: 'cascade' }),
    assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.categoryId, table.collaboratorId] }),
    index().on(table.collaboratorId),
  ],
);

export type Category = typeof categories.$inferSelect;
