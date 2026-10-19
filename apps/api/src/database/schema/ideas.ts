import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  customType,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { FieldType, FieldValues } from '../../ideas/domain/fields';
import type { Status } from '../../ideas/domain/idea';
import { categories } from './categories';
import { collaborators } from './collaborators';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const customFields = pgTable('custom_fields', {
  id: uuid().primaryKey().defaultRandom(),
  label: text().notNull(),
  help: text().notNull().default(''),
  type: text().$type<FieldType>().notNull(),
  required: boolean().notNull().default(false),
  options: jsonb().$type<string[]>().notNull().default([]),
  // Text fields only: their content feeds Similar Idea detection.
  useForDetection: boolean().notNull().default(false),
  position: integer().notNull().default(0),
  // A field already filled in on some Idea can only be deactivated, never deleted.
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const ideas = pgTable(
  'ideas',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Friendly number to cite and use in URLs ("Idea #42").
    number: integer().generatedAlwaysAsIdentity().notNull().unique(),
    title: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    authorId: uuid()
      .notNull()
      .references(() => collaborators.id),
    status: text().$type<Status>().notNull(),
    // Custom Field values, keyed by field id.
    values: jsonb().$type<FieldValues>().notNull().default({}),
    // The Author asked to be shown as anonymous (needs the setting on when chosen).
    hiddenAuthorship: boolean().notNull().default(false),
    originalIdeaId: uuid().references((): AnyPgColumn => ideas.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true }),
    // Last edit by the Author after publishing (the Idea shows as "edited").
    editedAt: timestamp({ withTimezone: true }),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Stalled Idea notices. Valid only if later than `statusChangedAt`: a Status change starts over.
    stalledNotifiedAt: timestamp({ withTimezone: true }),
    stalledEscalatedAt: timestamp({ withTimezone: true }),
    // Values of the Custom Fields used for detection, kept up to date by IdeasService.
    detectionText: text().notNull().default(''),
    // Title weighs more than the other fields when ranking Similar Ideas.
    searchVector: tsvector().generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`setweight(to_tsvector('portuguese', immutable_unaccent(${ideas.title})), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent(${ideas.detectionText})), 'B')`,
    ),
  },
  (table) => [
    index().on(table.status),
    index().on(table.categoryId),
    index().on(table.authorId),
    index().on(table.publishedAt),
    index('ideas_search_vector_index').using('gin', table.searchVector),
    index('ideas_title_trigram_index').using(
      'gin',
      sql`immutable_unaccent(lower(${table.title})) gin_trgm_ops`,
    ),
    check(
      'ideas_valid_status',
      sql`${table.status} in ('draft','open','under_review','approved','in_progress','done','declined','duplicate','archived')`,
    ),
    check(
      'ideas_duplicate_has_original',
      sql`(${table.status} = 'duplicate') = (${table.originalIdeaId} is not null)`,
    ),
  ],
);

export type HistoryEventType = 'status' | 'category';

/** Idea History: Status and Category changes, with who changed them and the justification. */
export const ideaHistory = pgTable(
  'idea_history',
  {
    id: uuid().primaryKey().defaultRandom(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    type: text().$type<HistoryEventType>().notNull(),
    // Status or Category id, depending on the type. `fromValue` is null on publication.
    fromValue: text(),
    toValue: text().notNull(),
    justification: text(),
    collaboratorId: uuid()
      .notNull()
      .references(() => collaborators.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.ideaId, table.createdAt)],
);

export type CustomField = typeof customFields.$inferSelect;
export type Idea = typeof ideas.$inferSelect;

/**
 * What an Idea looked like before an edit made after publication (the Author can edit until it
 * goes under review). The current text lives on the Idea itself.
 */
export const ideaVersions = pgTable(
  'idea_versions',
  {
    id: uuid().primaryKey().defaultRandom(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    // 1 is the text as first published.
    version: integer().notNull(),
    title: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    values: jsonb().$type<FieldValues>().notNull(),
    // When this text became the current one, and when an edit replaced it.
    validFrom: timestamp({ withTimezone: true }).notNull(),
    replacedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.ideaId, table.version)],
);

export type IdeaVersion = typeof ideaVersions.$inferSelect;
