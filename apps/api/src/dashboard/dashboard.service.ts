import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { categories, collaborators, comments, ideas, likes } from '../database/schema';
import type { Status } from '../ideas/domain/idea';
import { isStalledSql } from '../ideas/domain/stalled';
import { StalledIdeasService } from '../ideas/stalled-ideas.service';
import { anonymousName } from '../ideas/domain/authorship';
import { toCsv } from './csv';

/** Statuses that answer the Author: the first time an Idea reaches one, it was decided. */
export const DECISION_STATUSES: Status[] = [
  'approved',
  'in_progress',
  'done',
  'declined',
  'duplicate',
];
const UNDECIDED: Status[] = ['open', 'under_review'];
const LIST_SIZE = 10;

const firstDecisionAt = sql<Date | null>`(
  select min(h.created_at) from idea_history h
  where h.idea_id = ${ideas.id} and h.type = 'status'
    and h.to_value in (${sql.join(
      DECISION_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    )}))`;

const published = sql`${ideas.status} <> 'draft'`;
const likeCount = sql<number>`(select count(*) from ${likes} where ${likes.ideaId} = ${ideas.id})::int`;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly stalledIdeas: StalledIdeasService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async overview() {
    const stalled = isStalledSql(this.stalledIdeas.deadlines());
    const [byStatus, byCategory, [decision], stalledIdeas, mostLiked] = await Promise.all([
      this.db
        .select({ status: ideas.status, total: sql<number>`count(*)::int` })
        .from(ideas)
        .where(published)
        .groupBy(ideas.status),
      this.db
        .select({
          id: categories.id,
          name: categories.name,
          total: sql<number>`count(${ideas.id})::int`,
          undecided: sql<number>`(count(${ideas.id}) filter (where ${inArray(ideas.status, UNDECIDED)}))::int`,
        })
        .from(categories)
        .leftJoin(ideas, and(eq(ideas.categoryId, categories.id), published))
        .groupBy(categories.id, categories.name)
        .orderBy(asc(categories.name)),
      this.db
        .select({
          decided: sql<number>`count(*)::int`,
          averageHours: sql<
            number | null
          >`avg(extract(epoch from (d.at - d.published_at)) / 3600)::float8`,
        })
        .from(
          this.db
            .select({
              at: sql<Date>`${firstDecisionAt}`.as('at'),
              publishedAt: sql<Date>`${ideas.publishedAt}`.as('published_at'),
            })
            .from(ideas)
            .where(and(published, sql`${ideas.publishedAt} is not null`))
            .as('d'),
        )
        .where(sql`d.at is not null`),
      this.db
        .select({
          number: ideas.number,
          title: ideas.title,
          status: ideas.status,
          category: categories.name,
          days: sql<number>`floor(extract(epoch from (now() - ${ideas.statusChangedAt})) / 86400)::int`,
        })
        .from(ideas)
        .innerJoin(categories, eq(ideas.categoryId, categories.id))
        .where(stalled)
        .orderBy(asc(ideas.statusChangedAt))
        .limit(LIST_SIZE),
      this.db
        .select({
          number: ideas.number,
          title: ideas.title,
          status: ideas.status,
          category: categories.name,
          likes: likeCount,
        })
        .from(ideas)
        .innerJoin(categories, eq(ideas.categoryId, categories.id))
        .where(inArray(ideas.status, UNDECIDED))
        .orderBy(desc(likeCount), desc(ideas.number))
        .limit(LIST_SIZE),
    ]);

    return {
      byStatus,
      byCategory,
      firstDecision: {
        decided: decision?.decided ?? 0,
        averageHours: decision?.averageHours ?? null,
      },
      stalled: stalledIdeas,
      mostLikedUndecided: mostLiked,
    };
  }

  /** Every published Idea, one row each. */
  async exportCsv() {
    const author = alias(collaborators, 'author');
    const rows = await this.db
      .select({
        number: ideas.number,
        title: ideas.title,
        status: ideas.status,
        category: categories.name,
        author: sql<string>`case when ${ideas.hiddenAuthorship} then ${anonymousName(this.env.SIM_LOCALE)} else ${author.name} end`,
        publishedAt: ideas.publishedAt,
        statusChangedAt: ideas.statusChangedAt,
        firstDecisionAt,
        likes: likeCount,
        comments: sql<number>`(select count(*) from ${comments} where ${comments.ideaId} = ${ideas.id} and ${comments.removedAt} is null)::int`,
        stalled: isStalledSql(this.stalledIdeas.deadlines()),
      })
      .from(ideas)
      .innerJoin(categories, eq(ideas.categoryId, categories.id))
      .innerJoin(author, eq(ideas.authorId, author.id))
      .where(published)
      .orderBy(asc(ideas.number));

    return toCsv(
      [
        'number',
        'title',
        'status',
        'category',
        'author',
        'published_at',
        'status_changed_at',
        'first_decision_at',
        'likes',
        'comments',
        'stalled',
      ],
      rows.map((row) => [
        row.number,
        row.title,
        row.status,
        row.category,
        row.author,
        row.publishedAt,
        row.statusChangedAt,
        row.firstDecisionAt ? new Date(row.firstDecisionAt) : null,
        row.likes,
        row.comments,
        row.stalled ? 'yes' : 'no',
      ]),
    );
  }
}
