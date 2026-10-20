import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ideas } from './ideas';

/** Labels curated by the Administrator; the Author and the Reviewers put them on Ideas. */
export const tags = pgTable(
  'tags',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tags_name_unique').on(sql`lower(${table.name})`)],
);

export const ideaTags = pgTable(
  'idea_tags',
  {
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    // Deleting a Tag takes it off every Idea.
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.ideaId, table.tagId] }), index().on(table.tagId)],
);

export type Tag = typeof tags.$inferSelect;
