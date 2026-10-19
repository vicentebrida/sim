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
import { collaborators } from './collaborators';
import { ideas } from './ideas';

export const comments = pgTable(
  'comments',
  {
    id: uuid().primaryKey().defaultRandom(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => collaborators.id),
    // Comment being replied to (one level only: Replies are not replied to).
    replyToId: uuid().references((): AnyPgColumn => comments.id),
    // Mentions are marked up as `@[Name](id)`. Empty once removed.
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp({ withTimezone: true }),
    // Removed by its author: shown as "comment removed", without the text.
    removedAt: timestamp({ withTimezone: true }),
    // Hidden Comment, by a Reviewer or Administrator, with a reason.
    hiddenAt: timestamp({ withTimezone: true }),
    hiddenById: uuid().references(() => collaborators.id),
    hiddenReason: text(),
  },
  (table) => [
    index().on(table.ideaId, table.createdAt),
    index().on(table.replyToId),
    check(
      'comments_hiding_complete',
      sql`(${table.hiddenAt} is null) = (${table.hiddenById} is null) and (${table.hiddenAt} is null) = (${table.hiddenReason} is null)`,
    ),
  ],
);

/** Collaborators mentioned in each Comment (basis for Mention Notifications). */
export const mentions = pgTable(
  'mentions',
  {
    commentId: uuid()
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    collaboratorId: uuid()
      .notNull()
      .references(() => collaborators.id),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.collaboratorId] }),
    index().on(table.collaboratorId),
  ],
);

export type Comment = typeof comments.$inferSelect;
