import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { NotificationType } from '../../notifications/domain/recipients';
import { collaborators } from './collaborators';
import { comments } from './comments';
import { ideas } from './ideas';

export type EmailStatus = 'none' | 'pending' | 'sent' | 'failed';

/** Who Follows each Idea and gets Notifications about it. */
export const followers = pgTable(
  'followers',
  {
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    collaboratorId: uuid()
      .notNull()
      .references(() => collaborators.id),
    since: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ideaId, table.collaboratorId] }),
    index().on(table.collaboratorId),
  ],
);

/**
 * In-app Notification (the bell). It does not copy the Comment text: if the Comment is hidden or
 * removed later, the Notification still points to the Idea without exposing the content.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    recipientId: uuid()
      .notNull()
      .references(() => collaborators.id),
    type: text().$type<NotificationType>().notNull(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    commentId: uuid().references(() => comments.id, { onDelete: 'cascade' }),
    // Who caused the event (null for system notices, such as Stalled Ideas).
    actorId: uuid().references(() => collaborators.id),
    // Details to display, depending on the type (e.g. Status from/to, original Idea).
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp({ withTimezone: true }),
    // E-mail copy: `pending` is picked up by the dispatcher job (ADR-0006: the database is the
    // source of truth, the queue is only the way to get there).
    emailStatus: text().$type<EmailStatus>().notNull().default('none'),
    emailAttempts: integer().notNull().default(0),
    emailSentAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.recipientId, table.createdAt),
    index('notifications_unread_index')
      .on(table.recipientId)
      .where(sql`${table.readAt} is null`),
    index('notifications_email_pending_index')
      .on(table.createdAt)
      .where(sql`${table.emailStatus} = 'pending'`),
    check(
      'notifications_valid_email_status',
      sql`${table.emailStatus} in ('none','pending','sent','failed')`,
    ),
    check(
      'notifications_valid_type',
      sql`${table.type} in ('status','duplicate','comment','reply','mention','new_idea')`,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
