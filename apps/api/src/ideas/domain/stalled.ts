import { type SQL, sql } from 'drizzle-orm';
import { categories, ideas } from '../../database/schema';

export interface StalledDeadlines {
  openDays: number;
  reviewDays: number;
}

/**
 * Stalled Idea: Open or Under review for longer than the deadline of its Category (or the
 * installation default) without a Reviewer changing the Status. Needs `categories` joined.
 */
export function isStalledSql(defaults: StalledDeadlines): SQL<boolean> {
  const since = (days: SQL) =>
    sql`${ideas.statusChangedAt} < now() - make_interval(days => ${days})`;
  return sql<boolean>`(
    (${ideas.status} = 'open' and ${since(sql`coalesce(${categories.stalledOpenDays}, ${defaults.openDays})`)})
    or (${ideas.status} = 'under_review' and ${since(sql`coalesce(${categories.stalledReviewDays}, ${defaults.reviewDays})`)})
  )`;
}

/** What the daily check has to do with a stalled Idea. */
export function stalledStage(
  idea: { statusChangedAt: Date; stalledNotifiedAt: Date | null; stalledEscalatedAt: Date | null },
  now: Date,
  escalationDays: number,
): 'notify_reviewers' | 'escalate' | 'none' {
  const current = (moment: Date | null) => moment !== null && moment > idea.statusChangedAt;
  if (!current(idea.stalledNotifiedAt)) return 'notify_reviewers';
  if (current(idea.stalledEscalatedAt)) return 'none';
  const wait = escalationDays * 86_400_000;
  return now.getTime() - idea.stalledNotifiedAt!.getTime() >= wait ? 'escalate' : 'none';
}
