import { check, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export interface BrandingAsset {
  storageKey: string;
  contentType: string;
}

export const BRANDING_ASSETS = ['logoLight', 'logoDark', 'favicon', 'loginImage'] as const;
export type BrandingAssetKind = (typeof BRANDING_ASSETS)[number];

/** Visual identity of the installation (PRD §3.12). A single row. */
export const branding = pgTable(
  'branding',
  {
    id: integer().primaryKey().default(1),
    name: text().notNull().default('SIM'),
    // `#rrggbb`; null keeps the default theme color.
    primaryColor: text(),
    loginTitle: text().notNull().default(''),
    loginText: text().notNull().default(''),
    logoLight: jsonb().$type<BrandingAsset>(),
    logoDark: jsonb().$type<BrandingAsset>(),
    favicon: jsonb().$type<BrandingAsset>(),
    loginImage: jsonb().$type<BrandingAsset>(),
    // Changes with every edit, so browsers fetch new images.
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('branding_single_row', sql`${table.id} = 1`)],
);

export type Branding = typeof branding.$inferSelect;
