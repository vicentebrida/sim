import { check, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export interface BrandingAsset {
  storageKey: string;
  contentType: string;
}

/**
 * Interface texts the Administrator may replace (a chosen set, not every text: the domain terms
 * stay, PRD §7). Each one per language; a missing or empty one shows the SIM default.
 */
export const CUSTOM_TEXTS = {
  homeTitle: 80,
  homeSubtitle: 300,
  newIdeaButton: 40,
  // New: no default text, shown at the top of the new Idea form when set.
  newIdeaGuidance: 1000,
  titleHelp: 120,
  similarTitle: 80,
  similarHelp: 300,
} as const;
export type CustomTextKey = keyof typeof CUSTOM_TEXTS;
export const TEXT_LANGUAGES = ['pt-BR', 'en'] as const;
export type CustomTexts = Partial<
  Record<CustomTextKey, Partial<Record<(typeof TEXT_LANGUAGES)[number], string>>>
>;

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
    texts: jsonb().$type<CustomTexts>().notNull().default({}),
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
