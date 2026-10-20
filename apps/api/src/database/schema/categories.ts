import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
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
    // Stalled Idea deadlines in days; null follows the installation default (SIM_STALLED_*).
    stalledOpenDays: integer(),
    stalledReviewDays: integer(),
    // Whoever is in this SSO group becomes a Reviewer of the Category at each SSO login.
    ssoGroup: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('categories_name_unique').on(sql`lower(${table.name})`),
    check(
      'categories_valid_stalled_days',
      sql`(${table.stalledOpenDays} is null or ${table.stalledOpenDays} > 0) and (${table.stalledReviewDays} is null or ${table.stalledReviewDays} > 0)`,
    ),
  ],
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
    // Came from the Category's SSO group, and leaves with it; false when chosen by an Administrator.
    viaSso: boolean().notNull().default(false),
    assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.categoryId, table.collaboratorId] }),
    index().on(table.collaboratorId),
  ],
);

export type Category = typeof categories.$inferSelect;
