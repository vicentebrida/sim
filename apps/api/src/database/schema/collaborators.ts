import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const EMAIL_MODES = ['instant', 'daily', 'off'] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];

export const collaborators = pgTable(
  'collaborators',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    // Always lowercase: links the local account, SSO and SIM_ADMIN_EMAILS.
    email: text().notNull().unique(),
    passwordHash: text(),
    mustChangePassword: boolean().notNull().default(false),
    ssoSubject: text().unique(),
    department: text(),
    pictureUrl: text(),
    administrator: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    // Preference: Notification of new Comments on followed Ideas.
    notifyNewComments: boolean().notNull().default(true),
    // Preference: Notifications by e-mail as they happen, once a day in a summary, or not at all.
    emailMode: text().$type<EmailMode>().notNull().default('instant'),
    // Set when the personal data was erased (irreversible).
    anonymizedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    check('collaborators_valid_email_mode', sql`${table.emailMode} in ('instant','daily','off')`),
  ],
);

export type Collaborator = typeof collaborators.$inferSelect;
