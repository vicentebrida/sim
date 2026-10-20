import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database, type Executor } from '../database/database.module';
import {
  type Collaborator,
  type EmailMode,
  collaborators,
  followers,
  type Idea,
  ideas,
  notifications,
  reviewers,
} from '../database/schema';
import { presentPerson } from '../ideas/domain/authorship';
import type { Status } from '../ideas/domain/idea';
import { commentRecipients, type NotificationType, recipientsExcept } from './domain/recipients';

interface NewNotification {
  recipientId: string;
  type: NotificationType;
  ideaId: string;
  /** Missing for system notices, such as Stalled Ideas. */
  actorId?: string;
  commentId?: string;
  data?: Record<string, unknown>;
}

/**
 * Following and Notifications. The `on...` methods take the caller's transaction, so a
 * Notification only exists if the event is stored (ADR-0006: the database is the source of truth).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------- following ----------

  async follow(executor: Executor, ideaId: string, collaboratorId: string) {
    await executor.insert(followers).values({ ideaId, collaboratorId }).onConflictDoNothing();
  }

  async unfollow(ideaId: string, collaboratorId: string) {
    await this.db
      .delete(followers)
      .where(and(eq(followers.ideaId, ideaId), eq(followers.collaboratorId, collaboratorId)));
  }

  async isFollowing(ideaId: string, collaboratorId: string) {
    const [row] = await this.db
      .select({ ideaId: followers.ideaId })
      .from(followers)
      .where(and(eq(followers.ideaId, ideaId), eq(followers.collaboratorId, collaboratorId)));
    return Boolean(row);
  }

  // ---------- events ----------

  /**
   * An Idea published in a Category (or recategorized into it) notifies its Reviewers. Categories
   * without Reviewers are handled by the Administrators, so they are notified instead.
   */
  async onArrivedInCategory(executor: Executor, idea: Idea, categoryId: string, actorId: string) {
    const recipients = recipientsExcept(
      actorId,
      await this.reviewersOrAdministrators(executor, idea, categoryId),
    );
    await this.record(
      executor,
      recipients.map((recipientId) => ({
        recipientId,
        type: 'new_idea',
        ideaId: idea.id,
        actorId,
      })),
    );
  }

  /**
   * A Stalled Idea first tells its Reviewers; if still stalled later, it escalates to the
   * Administrators. System notices: no actor.
   */
  async onStalled(executor: Executor, idea: Idea, stage: 'notify_reviewers' | 'escalate') {
    const recipients =
      stage === 'escalate'
        ? (
            await executor
              .select({ id: collaborators.id })
              .from(collaborators)
              .where(and(eq(collaborators.administrator, true), eq(collaborators.active, true)))
          )
            .map(({ id }) => id)
            .filter((id) => id !== idea.authorId)
        : await this.reviewersOrAdministrators(executor, idea, idea.categoryId);
    await this.record(
      executor,
      recipients.map((recipientId) => ({
        recipientId,
        type: stage === 'escalate' ? 'stalled_escalated' : 'stalled',
        ideaId: idea.id,
        data: { status: idea.status },
      })),
    );
  }

  /**
   * Reviewers of the Category; Categories without Reviewers are handled by the Administrators.
   * The Author does not review their own Idea, so they are never in the list.
   */
  private async reviewersOrAdministrators(executor: Executor, idea: Idea, categoryId: string) {
    const categoryReviewers = await executor
      .select({ id: reviewers.collaboratorId })
      .from(reviewers)
      .innerJoin(collaborators, eq(reviewers.collaboratorId, collaborators.id))
      .where(and(eq(reviewers.categoryId, categoryId), eq(collaborators.active, true)));
    const candidates = categoryReviewers.length
      ? categoryReviewers
      : await executor
          .select({ id: collaborators.id })
          .from(collaborators)
          .where(and(eq(collaborators.administrator, true), eq(collaborators.active, true)));
    return candidates.map(({ id }) => id).filter((id) => id !== idea.authorId);
  }

  /**
   * A Status change notifies the Followers. When the Idea becomes a Duplicate, they get the link
   * to the original Idea and start following it.
   */
  async onStatusChanged(
    executor: Executor,
    idea: Idea,
    change: { from: Status; to: Status; original?: Idea },
    actorId: string,
  ) {
    const recipients = recipientsExcept(actorId, await this.activeFollowers(executor, idea));
    const { original } = change;
    await this.record(
      executor,
      recipients.map((recipientId) => ({
        recipientId,
        type: original ? 'duplicate' : 'status',
        ideaId: idea.id,
        actorId,
        data: original
          ? { original: { number: original.number, title: original.title } }
          : { from: change.from, to: change.to },
      })),
    );

    if (original) {
      await executor.execute(sql`
        insert into ${followers} (idea_id, collaborator_id, since)
        select ${original.id}, collaborator_id, since from ${followers}
        where idea_id = ${idea.id}
        on conflict do nothing`);
      await executor.delete(followers).where(eq(followers.ideaId, idea.id));
    }
  }

  async onCommented(
    executor: Executor,
    event: {
      idea: Idea;
      commentId: string;
      actorId: string;
      repliedToAuthorId?: string;
      mentioned: readonly string[];
    },
  ) {
    const ideaFollowers = await executor
      .select({
        id: followers.collaboratorId,
        wantsNewComments: collaborators.notifyNewComments,
      })
      .from(followers)
      .innerJoin(collaborators, eq(followers.collaboratorId, collaborators.id))
      .where(and(eq(followers.ideaId, event.idea.id), eq(collaborators.active, true)));
    const recipients = commentRecipients({ ...event, followers: ideaFollowers });
    await this.record(
      executor,
      [...recipients].map(([recipientId, type]) => ({
        recipientId,
        type,
        ideaId: event.idea.id,
        commentId: event.commentId,
        actorId: event.actorId,
      })),
    );
  }

  /** When editing, only people newly mentioned are notified. */
  async onMentionedInEdit(
    executor: Executor,
    event: { idea: Idea; commentId: string; actorId: string; added: readonly string[] },
  ) {
    await this.record(
      executor,
      recipientsExcept(event.actorId, event.added).map((recipientId) => ({
        recipientId,
        type: 'mention',
        ideaId: event.idea.id,
        commentId: event.commentId,
        actorId: event.actorId,
      })),
    );
  }

  // ---------- the bell ----------

  async list(collaborator: Collaborator, filter: { page: number; pageSize: number }) {
    const actor = alias(collaborators, 'actor');
    const mine = eq(notifications.recipientId, collaborator.id);
    const [rows, [counted], unread] = await Promise.all([
      this.db
        .select({
          notification: notifications,
          idea: { number: ideas.number, title: ideas.title },
          authorship: {
            id: ideas.id,
            authorId: ideas.authorId,
            hiddenAuthorship: ideas.hiddenAuthorship,
          },
          actor: { id: actor.id, name: actor.name },
        })
        .from(notifications)
        .innerJoin(ideas, eq(notifications.ideaId, ideas.id))
        .leftJoin(actor, eq(notifications.actorId, actor.id))
        .where(mine)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(notifications).where(mine),
      this.countUnread(collaborator),
    ]);
    return {
      items: rows.map(({ notification, idea, authorship, actor: who }) => ({
        id: notification.id,
        type: notification.type,
        idea,
        // A hidden Author acting on their own Idea (publishing, commenting) stays hidden.
        actor: who && presentPerson(authorship, who, collaborator.id, this.env.SIM_LOCALE),
        commentId: notification.commentId,
        data: notification.data,
        createdAt: notification.createdAt.toISOString(),
        read: notification.readAt !== null,
      })),
      total: counted?.total ?? 0,
      unread,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async countUnread(collaborator: Collaborator) {
    const [row] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientId, collaborator.id), isNull(notifications.readAt)));
    return row?.total ?? 0;
  }

  async markRead(collaborator: Collaborator, id: string) {
    const updated = await this.db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(eq(notifications.id, id), eq(notifications.recipientId, collaborator.id)))
      .returning({ id: notifications.id });
    if (!updated.length) throw new NotFoundException('Notification not found');
  }

  async markAllRead(collaborator: Collaborator) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientId, collaborator.id), isNull(notifications.readAt)));
  }

  preferences(collaborator: Collaborator) {
    return {
      newComments: collaborator.notifyNewComments,
      email: collaborator.emailMode,
      emailAvailable: Boolean(this.env.SMTP_URL),
    };
  }

  async setPreferences(
    collaborator: Collaborator,
    data: { newComments?: boolean; email?: EmailMode },
  ) {
    if (data.newComments === undefined && data.email === undefined) {
      return this.preferences(collaborator);
    }
    const [updated] = await this.db
      .update(collaborators)
      .set({
        ...(data.newComments !== undefined && { notifyNewComments: data.newComments }),
        ...(data.email !== undefined && { emailMode: data.email }),
      })
      .where(eq(collaborators.id, collaborator.id))
      .returning();
    return this.preferences(updated ?? collaborator);
  }

  // ---------- support ----------

  private async activeFollowers(executor: Executor, idea: Idea) {
    const rows = await executor
      .select({ id: followers.collaboratorId })
      .from(followers)
      .innerJoin(collaborators, eq(followers.collaboratorId, collaborators.id))
      .where(and(eq(followers.ideaId, idea.id), eq(collaborators.active, true)));
    return rows.map(({ id }) => id);
  }

  private async record(executor: Executor, created: NewNotification[]) {
    if (!created.length) return;
    const inserted = await executor
      .insert(notifications)
      .values(created)
      .returning({ id: notifications.id, recipientId: notifications.recipientId });
    if (!this.env.SMTP_URL) return;
    // E-mail copy for whoever wants it: now or in the daily summary (sent by the jobs, ADR-0006).
    const ids = inserted.map(({ id }) => id);
    for (const [mode, emailStatus] of [
      ['instant', 'pending'],
      ['daily', 'digest'],
    ] as const) {
      await executor
        .update(notifications)
        .set({ emailStatus })
        .where(
          and(
            inArray(notifications.id, ids),
            inArray(
              notifications.recipientId,
              executor
                .select({ id: collaborators.id })
                .from(collaborators)
                .where(and(eq(collaborators.emailMode, mode), eq(collaborators.active, true))),
            ),
          ),
        );
    }
  }
}
