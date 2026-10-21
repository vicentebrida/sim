import { boolean, check, integer, pgTable } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Product settings of the installation, chosen by the Administrator. A single row. */
export const installationSettings = pgTable(
  'installation_settings',
  {
    id: integer().primaryKey().default(1),
    // Lets Authors hide their name on an Idea (PRD §3.10). Off by default.
    hiddenAuthorshipEnabled: boolean().notNull().default(false),
    // Stalled Idea deadlines in days; null follows the SIM_STALLED_* default of the environment.
    stalledOpenDays: integer(),
    stalledReviewDays: integer(),
    stalledEscalationDays: integer(),
    // Automatic archiving of Open Ideas without Likes or Comments for this many days; null is off.
    autoArchiveDays: integer(),
  },
  (table) => [
    check('installation_settings_single_row', sql`${table.id} = 1`),
    check(
      'installation_settings_valid_stalled_days',
      sql`(${table.stalledOpenDays} is null or ${table.stalledOpenDays} > 0) and (${table.stalledReviewDays} is null or ${table.stalledReviewDays} > 0) and (${table.stalledEscalationDays} is null or ${table.stalledEscalationDays} > 0)`,
    ),
    check(
      'installation_settings_valid_auto_archive_days',
      sql`${table.autoArchiveDays} is null or ${table.autoArchiveDays} > 0`,
    ),
  ],
);

export type InstallationSettings = typeof installationSettings.$inferSelect;
