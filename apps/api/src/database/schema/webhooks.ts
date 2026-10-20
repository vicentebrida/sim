import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { collaborators } from './collaborators';
import { ideas } from './ideas';

export const WEBHOOK_CHANNELS = ['slack', 'teams', 'google_chat'] as const;
export type WebhookChannel = (typeof WEBHOOK_CHANNELS)[number];
export type WebhookEvent = 'published' | 'status';

/**
 * A message for a chat channel, recorded in the same transaction as the event and sent by a
 * background job (ADR-0006). The text is rendered at sending time from the current Idea.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: text().$type<WebhookChannel>().notNull(),
    event: text().$type<WebhookEvent>().notNull(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    actorId: uuid().references(() => collaborators.id),
    // For `status`: { from, to }.
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: text().$type<'pending' | 'sent' | 'failed'>().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    retryAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_pending_index')
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    check('webhook_deliveries_valid_status', sql`${table.status} in ('pending','sent','failed')`),
    check(
      'webhook_deliveries_valid_channel',
      sql`${table.channel} in ('slack','teams','google_chat')`,
    ),
  ],
);
