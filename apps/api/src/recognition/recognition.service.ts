import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { categories, type Collaborator, collaborators, ideas, likes } from '../database/schema';
import { presentPerson } from '../ideas/domain/authorship';
import { viewerLocale } from '../common/viewer-locale';

const RECENT = 5;
const likeCount = sql<number>`(select count(*) from ${likes} where ${likes.ideaId} = ${ideas.id})::int`;

/**
 * Recognition (PRD §3.13): the Ideas a person saw carried out, on their public profile and on
 * the home page. No points, no ranking and nothing that counts how much someone sent.
 */
@Injectable()
export class RecognitionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async profile(viewer: Collaborator, id: string) {
    const [person] = await this.db.select().from(collaborators).where(eq(collaborators.id, id));
    // An anonymized person has no profile left.
    if (!person || person.anonymizedAt) throw new NotFoundException('Profile not found');

    const completed = await this.db
      .select({
        number: ideas.number,
        title: ideas.title,
        category: { id: categories.id, name: categories.name },
        completedAt: ideas.statusChangedAt,
        likes: likeCount,
        hiddenAuthorship: ideas.hiddenAuthorship,
      })
      .from(ideas)
      .innerJoin(categories, eq(ideas.categoryId, categories.id))
      .where(
        and(
          eq(ideas.authorId, id),
          eq(ideas.status, 'done'),
          // Hidden authorship stays hidden: only the Author sees those Ideas on their profile.
          viewer.id === id ? undefined : eq(ideas.hiddenAuthorship, false),
        ),
      )
      .orderBy(desc(ideas.statusChangedAt), desc(ideas.number));

    return {
      id: person.id,
      name: person.name,
      department: person.department,
      active: person.active,
      completed: completed.map((idea) => ({
        ...idea,
        completedAt: idea.completedAt.toISOString(),
      })),
      likesOnCompleted: completed.reduce((total, idea) => total + idea.likes, 0),
    };
  }

  /** The latest Ideas Done, for the home page. */
  async recentlyCompleted(viewer: Collaborator) {
    const author = alias(collaborators, 'author');
    const rows = await this.db
      .select({
        idea: ideas,
        category: { id: categories.id, name: categories.name },
        author: { id: author.id, name: author.name },
      })
      .from(ideas)
      .innerJoin(categories, eq(ideas.categoryId, categories.id))
      .innerJoin(author, eq(ideas.authorId, author.id))
      .where(eq(ideas.status, 'done'))
      .orderBy(desc(ideas.statusChangedAt), desc(ideas.number))
      .limit(RECENT);
    return rows.map(({ idea, category, author: person }) => ({
      number: idea.number,
      title: idea.title,
      category,
      completedAt: idea.statusChangedAt.toISOString(),
      hiddenAuthorship: idea.hiddenAuthorship,
      author: presentPerson(idea, person, viewer.id, viewerLocale(this.env.SIM_LOCALE)),
    }));
  }
}
