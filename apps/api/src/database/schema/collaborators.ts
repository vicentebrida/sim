import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const collaborators = pgTable('collaborators', {
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
  // Preference: also receive Notifications by e-mail.
  notifyByEmail: boolean().notNull().default(true),
  // Set when the personal data was erased (irreversible).
  anonymizedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp({ withTimezone: true }),
});

export type Collaborator = typeof collaborators.$inferSelect;
