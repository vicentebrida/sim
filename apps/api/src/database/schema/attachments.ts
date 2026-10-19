import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { collaborators } from './collaborators';
import { comments } from './comments';
import { ideas } from './ideas';

/**
 * File sent with an Idea or, when `commentId` is set, with one of its Comments. The bytes live in
 * the file storage under `storageKey`; downloads always go through the API.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid().primaryKey().defaultRandom(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    commentId: uuid().references(() => comments.id, { onDelete: 'cascade' }),
    uploaderId: uuid()
      .notNull()
      .references(() => collaborators.id),
    // Name given by the uploader, only for display and the download name.
    filename: text().notNull(),
    // Decided by the API from the file content, never trusted from the client.
    contentType: text().notNull(),
    size: bigint({ mode: 'number' }).notNull(),
    storageKey: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.ideaId), index().on(table.commentId)],
);

export type Attachment = typeof attachments.$inferSelect;
