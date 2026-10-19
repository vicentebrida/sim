import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNull, ne, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DomainError } from '../common/domain-error';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DB, type Database, type Transaction } from '../database/database.module';
import {
  categories,
  type Collaborator,
  collaborators,
  comments,
  followers,
  type Idea,
  ideaHistory,
  ideas,
  likes,
  reviewers,
} from '../database/schema';
import { type FieldValues, normalizeValues } from './domain/fields';
import {
  type Actor,
  assertCanChangeStatus,
  assertCanDelete,
  assertCanEdit,
  assertCanLike,
  assertCanPublish,
  assertCanRecategorize,
  canView,
  permissions,
  type SortOrder,
  type Status,
  TRENDING_HALF_LIFE_DAYS,
} from './domain/idea';

export interface IdeaFilter {
  status?: Status[];
  categoryId?: string;
  author?: 'me';
  following?: boolean;
  sort: SortOrder;
  page: number;
  pageSize: number;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

const likeCount = sql<number>`(select count(*) from ${likes} where ${likes.ideaId} = ${ideas.id})::int`;

const likedBy = (collaborator: Collaborator) =>
  sql<boolean>`exists (select 1 from ${likes} where ${likes.ideaId} = ${ideas.id} and ${likes.collaboratorId} = ${collaborator.id})`;

/** Weight of an event that happened at `moment`: 1 now, half after each half-life. */
const weight = (moment: SQL) =>
  sql`exp(-ln(2) * least(extract(epoch from (now() - ${moment})) / ${TRENDING_HALF_LIFE_DAYS * 86_400}, 1000))`;

// Removed or hidden Comments do not count.
const trendingScore = sql`(${weight(sql`coalesce(${ideas.publishedAt}, ${ideas.createdAt})`)}
  + coalesce((select sum(${weight(sql`${likes.createdAt}`)}) from ${likes} where ${likes.ideaId} = ${ideas.id}), 0)
  + coalesce((select sum(${weight(sql`${comments.createdAt}`)}) from ${comments} where ${comments.ideaId} = ${ideas.id} and ${comments.removedAt} is null and ${comments.hiddenAt} is null), 0))`;

const newest = [desc(sql`coalesce(${ideas.publishedAt}, ${ideas.createdAt})`), desc(ideas.number)];

const ORDER_BY: Record<SortOrder, SQL[]> = {
  trending: [desc(trendingScore), ...newest],
  most_liked: [desc(likeCount), ...newest],
  newest,
};

@Injectable()
export class IdeasService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly fields: CustomFieldsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- reading ----------

  async list(collaborator: Collaborator, filter: IdeaFilter) {
    const author = alias(collaborators, 'author');
    const where = and(
      // Drafts only show up for their Author.
      or(ne(ideas.status, 'draft'), eq(ideas.authorId, collaborator.id)),
      filter.status?.length
        ? inArray(ideas.status, filter.status)
        : filter.author === 'me'
          ? ne(ideas.status, 'archived')
          : and(ne(ideas.status, 'archived'), ne(ideas.status, 'draft')),
      filter.categoryId ? eq(ideas.categoryId, filter.categoryId) : undefined,
      filter.author === 'me' ? eq(ideas.authorId, collaborator.id) : undefined,
      filter.following
        ? sql`exists (select 1 from ${followers} where ${followers.ideaId} = ${ideas.id} and ${followers.collaboratorId} = ${collaborator.id})`
        : undefined,
    );

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          idea: ideas,
          category: { id: categories.id, name: categories.name },
          author: { id: author.id, name: author.name },
          likes: { total: likeCount, liked: likedBy(collaborator) },
        })
        .from(ideas)
        .innerJoin(categories, eq(ideas.categoryId, categories.id))
        .innerJoin(author, eq(ideas.authorId, author.id))
        .where(where)
        .orderBy(...ORDER_BY[filter.sort])
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(ideas).where(where),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.summary(row.idea),
        category: row.category,
        author: row.author,
        likes: row.likes,
      })),
      total: counted?.total ?? 0,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async detail(collaborator: Collaborator, number: number) {
    const { idea, actor } = await this.access(collaborator, { number });

    const changedBy = alias(collaborators, 'changed_by');
    const [[category], [author], fields, history, original, likeState, interaction, following] =
      await Promise.all([
        this.db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(eq(categories.id, idea.categoryId)),
        this.db
          .select({ id: collaborators.id, name: collaborators.name })
          .from(collaborators)
          .where(eq(collaborators.id, idea.authorId)),
        this.fields.list({ includeInactive: true }),
        this.db
          .select({
            event: ideaHistory,
            collaborator: { id: changedBy.id, name: changedBy.name },
          })
          .from(ideaHistory)
          .innerJoin(changedBy, eq(ideaHistory.collaboratorId, changedBy.id))
          .where(eq(ideaHistory.ideaId, idea.id))
          .orderBy(asc(ideaHistory.createdAt)),
        idea.originalIdeaId
          ? this.db
              .select({ number: ideas.number, title: ideas.title })
              .from(ideas)
              .where(eq(ideas.id, idea.originalIdeaId))
          : Promise.resolve([]),
        this.likeState(idea, collaborator),
        this.interactionFromOthers(idea),
        this.notifications.isFollowing(idea.id, collaborator.id),
      ]);

    // Category events store ids; show their names instead.
    const categoryIds = history
      .filter(({ event }) => event.type === 'category')
      .flatMap(({ event }) => [event.fromValue, event.toValue])
      .filter((id): id is string => Boolean(id));
    const categoryNames = new Map(
      categoryIds.length
        ? (
            await this.db
              .select({ id: categories.id, name: categories.name })
              .from(categories)
              .where(inArray(categories.id, categoryIds))
          ).map(({ id, name }) => [id, name])
        : [],
    );
    const display = (type: string, value: string | null) =>
      type === 'category' && value ? (categoryNames.get(value) ?? value) : value;

    const { canView: _, ...actions } = permissions(idea, actor, interaction);
    return {
      ...this.summary(idea),
      editedAt: iso(idea.editedAt),
      category: category!,
      author: author!,
      likes: likeState,
      following,
      values: idea.values,
      answers: fields
        .filter((field) => field.id in idea.values)
        .map((field) => ({
          fieldId: field.id,
          label: field.label,
          type: field.type,
          value: idea.values[field.id]!,
        })),
      originalIdea: original[0] ?? null,
      history: history.map(({ event, collaborator: who }) => ({
        id: event.id,
        type: event.type,
        from: display(event.type, event.fromValue),
        to: display(event.type, event.toValue)!,
        justification: event.justification,
        collaborator: who,
        createdAt: event.createdAt.toISOString(),
      })),
      permissions: actions,
    };
  }

  // ---------- writing ----------

  async create(
    collaborator: Collaborator,
    data: { title: string; categoryId: string; values: FieldValues; publish: boolean },
  ) {
    await this.requireActiveCategory(data.categoryId);
    const values = normalizeValues(
      await this.fieldDefinitions(),
      data.values,
      {},
      {
        enforceRequired: data.publish,
      },
    );

    const number = await this.db.transaction(async (tx) => {
      const now = new Date();
      const [idea] = await tx
        .insert(ideas)
        .values({
          title: data.title,
          categoryId: data.categoryId,
          authorId: collaborator.id,
          status: data.publish ? 'open' : 'draft',
          values,
          publishedAt: data.publish ? now : null,
        })
        .returning();
      // The Author follows their own Idea from the start, Drafts included.
      await this.notifications.follow(tx, idea!.id, collaborator.id);
      if (data.publish) await this.recordPublication(tx, idea!, collaborator);
      return idea!.number;
    });
    return this.detail(collaborator, number);
  }

  async update(
    collaborator: Collaborator,
    number: number,
    data: { title?: string; categoryId?: string; values?: FieldValues },
  ) {
    const { idea, actor } = await this.access(collaborator, { number });
    assertCanEdit(idea, actor);
    if (data.categoryId && data.categoryId !== idea.categoryId) {
      await this.requireActiveCategory(data.categoryId);
    }
    const published = idea.status !== 'draft';
    const values = data.values
      ? normalizeValues(await this.fieldDefinitions(), data.values, idea.values, {
          // A published Idea still needs its required fields when edited.
          enforceRequired: published,
        })
      : undefined;

    await this.db
      .update(ideas)
      .set({
        title: data.title,
        categoryId: data.categoryId,
        values,
        editedAt: published ? new Date() : undefined,
      })
      .where(eq(ideas.id, idea.id));
    return this.detail(collaborator, number);
  }

  async publish(collaborator: Collaborator, number: number) {
    const { idea, actor } = await this.access(collaborator, { number });
    assertCanPublish(idea, actor);
    await this.requireActiveCategory(idea.categoryId);
    const fields = await this.fieldDefinitions();
    const active = Object.fromEntries(
      Object.entries(idea.values).filter(([id]) => fields.some((f) => f.id === id && f.active)),
    );
    const values = normalizeValues(fields, active, idea.values, { enforceRequired: true });

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(ideas)
        .set({ status: 'open', values, publishedAt: now, statusChangedAt: now })
        .where(eq(ideas.id, idea.id));
      await this.recordPublication(tx, idea, collaborator);
    });
    return this.detail(collaborator, number);
  }

  async changeStatus(
    collaborator: Collaborator,
    number: number,
    data: { to: Status; justification: string; originalIdeaNumber?: number },
  ) {
    const { idea, actor } = await this.access(collaborator, { number });
    const originalIdea =
      data.to === 'duplicate' && data.originalIdeaNumber
        ? await this.find(data.originalIdeaNumber).catch(() => undefined)
        : undefined;
    assertCanChangeStatus(idea, data.to, actor, {
      justification: data.justification,
      originalIdea,
    });

    await this.db.transaction(async (tx) => {
      await tx
        .update(ideas)
        .set({
          status: data.to,
          originalIdeaId: originalIdea?.id ?? null,
          statusChangedAt: new Date(),
        })
        .where(eq(ideas.id, idea.id));
      if (originalIdea) await this.moveLikes(tx, idea, originalIdea);
      await this.notifications.onStatusChanged(
        tx,
        idea,
        { from: idea.status, to: data.to, original: originalIdea },
        collaborator.id,
      );
      await tx.insert(ideaHistory).values({
        ideaId: idea.id,
        type: 'status',
        fromValue: idea.status,
        toValue: data.to,
        justification: data.justification,
        collaboratorId: collaborator.id,
      });
    });
    return this.detail(collaborator, number);
  }

  async recategorize(
    collaborator: Collaborator,
    number: number,
    data: { categoryId: string; justification: string },
  ) {
    const { idea, actor } = await this.access(collaborator, { number });
    assertCanRecategorize(idea, actor, data.justification);
    if (data.categoryId === idea.categoryId) {
      throw new DomainError('SAME_CATEGORY', 'The Idea is already in this Category');
    }
    await this.requireActiveCategory(data.categoryId);

    await this.db.transaction(async (tx) => {
      await tx.update(ideas).set({ categoryId: data.categoryId }).where(eq(ideas.id, idea.id));
      await tx.insert(ideaHistory).values({
        ideaId: idea.id,
        type: 'category',
        fromValue: idea.categoryId,
        toValue: data.categoryId,
        justification: data.justification,
        collaboratorId: collaborator.id,
      });
      await this.notifications.onArrivedInCategory(tx, idea, data.categoryId, collaborator.id);
    });
    return this.detail(collaborator, number);
  }

  async delete(collaborator: Collaborator, number: number) {
    const { idea, actor } = await this.access(collaborator, { number });
    assertCanDelete(idea, actor, await this.interactionFromOthers(idea));
    await this.db.delete(ideas).where(eq(ideas.id, idea.id));
  }

  // ---------- Likes ----------

  async like(collaborator: Collaborator, number: number) {
    const { idea, actor } = await this.access(collaborator, { number });
    assertCanLike(idea, actor);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(likes)
        .values({ ideaId: idea.id, collaboratorId: collaborator.id })
        .onConflictDoNothing();
      await this.notifications.follow(tx, idea.id, collaborator.id);
    });
    return this.likeState(idea, collaborator);
  }

  async unlike(collaborator: Collaborator, number: number) {
    const { idea, actor } = await this.access(collaborator, { number });
    assertCanLike(idea, actor);
    await this.db
      .delete(likes)
      .where(and(eq(likes.ideaId, idea.id), eq(likes.collaboratorId, collaborator.id)));
    return this.likeState(idea, collaborator);
  }

  /** Who liked, most recent first (a Like is always identified). */
  async listLikes(collaborator: Collaborator, number: number) {
    const { idea } = await this.access(collaborator, { number });
    const rows = await this.db
      .select({
        collaborator: { id: collaborators.id, name: collaborators.name },
        createdAt: likes.createdAt,
      })
      .from(likes)
      .innerJoin(collaborators, eq(likes.collaboratorId, collaborators.id))
      .where(eq(likes.ideaId, idea.id))
      .orderBy(desc(likes.createdAt));
    return rows.map((row) => ({
      collaborator: row.collaborator,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // ---------- following ----------

  async follow(collaborator: Collaborator, number: number) {
    const { idea } = await this.access(collaborator, { number });
    await this.notifications.follow(this.db, idea.id, collaborator.id);
    return { following: true };
  }

  async unfollow(collaborator: Collaborator, number: number) {
    const { idea } = await this.access(collaborator, { number });
    await this.notifications.unfollow(idea.id, collaborator.id);
    return { following: false };
  }

  // ---------- support ----------

  /** The Idea, if visible to the Collaborator, and their role in it; also used by Comments. */
  async access(collaborator: Collaborator, criteria: { number: number } | { id: string }) {
    const [idea] = await this.db
      .select()
      .from(ideas)
      .where('id' in criteria ? eq(ideas.id, criteria.id) : eq(ideas.number, criteria.number));
    const actor = idea && (await this.actor(collaborator, idea.categoryId));
    if (!idea || !actor || !canView(idea, actor)) throw new NotFoundException('Idea not found');
    return { idea, actor };
  }

  private summary(idea: Idea) {
    return {
      id: idea.id,
      number: idea.number,
      title: idea.title,
      status: idea.status,
      createdAt: idea.createdAt.toISOString(),
      publishedAt: iso(idea.publishedAt),
    };
  }

  private async find(number: number): Promise<Idea> {
    const [idea] = await this.db.select().from(ideas).where(eq(ideas.number, number));
    if (!idea) throw new NotFoundException('Idea not found');
    return idea;
  }

  private async actor(collaborator: Collaborator, categoryId: string): Promise<Actor> {
    const [assignment] = await this.db
      .select({ collaboratorId: reviewers.collaboratorId })
      .from(reviewers)
      .where(
        and(eq(reviewers.categoryId, categoryId), eq(reviewers.collaboratorId, collaborator.id)),
      );
    return {
      id: collaborator.id,
      administrator: collaborator.administrator,
      reviewsCategory: Boolean(assignment),
    };
  }

  private async likeState(idea: Idea, collaborator: Collaborator) {
    const [state] = await this.db
      .select({ total: likeCount, liked: likedBy(collaborator) })
      .from(ideas)
      .where(eq(ideas.id, idea.id));
    return state ?? { total: 0, liked: false };
  }

  /**
   * Likes or (non-removed) Comments from other people keep the Author from deleting the Idea.
   * The Author does not like their own Idea, so every Like comes from someone else.
   */
  private async interactionFromOthers(idea: Idea) {
    const [like, comment] = await Promise.all([
      this.db
        .select({ ideaId: likes.ideaId })
        .from(likes)
        .where(eq(likes.ideaId, idea.id))
        .limit(1),
      this.db
        .select({ id: comments.id })
        .from(comments)
        .where(
          and(
            eq(comments.ideaId, idea.id),
            ne(comments.authorId, idea.authorId),
            isNull(comments.removedAt),
          ),
        )
        .limit(1),
    ]);
    return { hasInteractionFromOthers: Boolean(like.length || comment.length) };
  }

  /**
   * Likes on the Duplicate move to the original Idea, without counting twice whoever liked both
   * and without giving the original's Author a Like on their own Idea.
   */
  private async moveLikes(tx: Transaction, duplicate: Idea, original: Idea) {
    await tx.execute(sql`
      insert into ${likes} (idea_id, collaborator_id, created_at)
      select ${original.id}, collaborator_id, created_at from ${likes}
      where idea_id = ${duplicate.id} and collaborator_id <> ${original.authorId}
      on conflict do nothing`);
    await tx.delete(likes).where(eq(likes.ideaId, duplicate.id));
  }

  private fieldDefinitions() {
    return this.fields.list({ includeInactive: true });
  }

  private async requireActiveCategory(categoryId: string) {
    const [category] = await this.db
      .select({ active: categories.active })
      .from(categories)
      .where(eq(categories.id, categoryId));
    if (!category?.active) {
      throw new DomainError('CATEGORY_UNAVAILABLE', 'Category does not exist or is inactive');
    }
  }

  /** Publishing records the History and tells the Category Reviewers about the new Idea. */
  private async recordPublication(tx: Transaction, idea: Idea, author: Collaborator) {
    await tx.insert(ideaHistory).values({
      ideaId: idea.id,
      type: 'status',
      fromValue: null,
      toValue: 'open',
      collaboratorId: author.id,
    });
    await this.notifications.onArrivedInCategory(tx, idea, idea.categoryId, author.id);
  }
}
