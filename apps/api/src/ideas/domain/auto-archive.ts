import { type SQL, sql } from 'drizzle-orm';
import { comments, ideas, likes } from '../../database/schema';

/** The Author is told this many days before the Idea is archived. */
export const ARCHIVE_WARNING_DAYS = 7;
/** Shortest inactivity the Administrator can choose (the warning has to fit in it). */
export const MIN_AUTO_ARCHIVE_DAYS = 14;

const DAY_MS = 86_400_000;

/**
 * Last sign of interest in an Idea: publication, edit, Status change, Like or Comment. Reviewer
 * inaction does not count here; that is what Stalled Ideas are for.
 */
export const lastActivitySql: SQL<Date> = sql<Date>`greatest(
  ${ideas.publishedAt},
  ${ideas.editedAt},
  ${ideas.statusChangedAt},
  (select max(${likes.createdAt}) from ${likes} where ${likes.ideaId} = ${ideas.id}),
  (select max(${comments.createdAt}) from ${comments} where ${comments.ideaId} = ${ideas.id})
)`;

/**
 * What the hourly check does with an Open Idea: warn the Author when the Idea is
 * ARCHIVE_WARNING_DAYS from being archived, and archive only after a full warning period.
 */
export function autoArchiveStage(
  idea: { lastActivity: Date; archiveWarnedAt: Date | null },
  now: Date,
  days: number,
): 'warn' | 'archive' | 'none' {
  const inactive = now.getTime() - idea.lastActivity.getTime();
  const warned = idea.archiveWarnedAt !== null && idea.archiveWarnedAt > idea.lastActivity;
  if (!warned) return inactive >= (days - ARCHIVE_WARNING_DAYS) * DAY_MS ? 'warn' : 'none';
  const sinceWarning = now.getTime() - idea.archiveWarnedAt!.getTime();
  return inactive >= days * DAY_MS && sinceWarning >= ARCHIVE_WARNING_DAYS * DAY_MS
    ? 'archive'
    : 'none';
}

/** Date the Idea will be archived, as told to the Author. */
export function archiveDate(warnedAt: Date) {
  return new Date(warnedAt.getTime() + ARCHIVE_WARNING_DAYS * DAY_MS);
}
