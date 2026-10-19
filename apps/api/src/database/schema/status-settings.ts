import { boolean, pgTable, text } from 'drizzle-orm/pg-core';
import type { Status } from '../../ideas/domain/idea';

/**
 * How the Administrator customized a Status (ADR-0004: only appearance, plus turning off the
 * optional ones). A Status without a row keeps its defaults.
 */
export const statusSettings = pgTable('status_settings', {
  status: text().$type<Status>().primaryKey(),
  // Replaces the translated name, in whatever language the Administrator writes it.
  label: text(),
  // `#rrggbb`.
  color: text(),
  description: text().notNull().default(''),
  enabled: boolean().notNull().default(true),
});

export type StatusSetting = typeof statusSettings.$inferSelect;
