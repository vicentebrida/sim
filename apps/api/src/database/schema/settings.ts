import { boolean, check, integer, pgTable } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Product settings of the installation, chosen by the Administrator. A single row. */
export const installationSettings = pgTable(
  'installation_settings',
  {
    id: integer().primaryKey().default(1),
    // Lets Authors hide their name on an Idea (PRD §3.10). Off by default.
    hiddenAuthorshipEnabled: boolean().notNull().default(false),
  },
  (table) => [check('installation_settings_single_row', sql`${table.id} = 1`)],
);

export type InstallationSettings = typeof installationSettings.$inferSelect;
