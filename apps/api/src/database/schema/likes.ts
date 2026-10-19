import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { collaborators } from './collaborators';
import { ideas } from './ideas';

/** One Like per Collaborator per Idea, always identified. */
export const likes = pgTable(
  'likes',
  {
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    collaboratorId: uuid()
      .notNull()
      .references(() => collaborators.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ideaId, table.collaboratorId] }),
    index().on(table.collaboratorId),
  ],
);
