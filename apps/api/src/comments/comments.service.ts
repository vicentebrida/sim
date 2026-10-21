import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AttachmentStore, type presentAttachment } from '../attachments/attachment-store';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database, type Transaction } from '../database/database.module';
import {
  type Collaborator,
  type Comment,
  collaborators,
  comments,
  mentions,
} from '../database/schema';
import { type IdeaAuthorship, presentPerson } from '../ideas/domain/authorship';
import type { Actor, IdeaForRules } from '../ideas/domain/idea';
import { IdeasService } from '../ideas/ideas.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  assertCanComment,
  assertCanEditComment,
  assertCanHideComment,
  assertCanRemoveComment,
  canReadText,
  type CommentForRules,
  commentPermissions,
} from './domain/comment';
import { mentionedIds, normalizeMentions } from './domain/mentions';
import { viewerLocale } from '../common/viewer-locale';

type Reference = { id: string; name: string };
type CommentWithNames = { comment: Comment; author: Reference; hiddenBy: Reference | null };

const forRules = (comment: Comment): CommentForRules => ({
  authorId: comment.authorId,
  replyToId: comment.replyToId,
  removed: comment.removedAt !== null,
  hidden: comment.hiddenAt !== null,
});

@Injectable()
export class CommentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ideas: IdeasService,
    private readonly notifications: NotificationsService,
    private readonly attachmentStore: AttachmentStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The Idea's Comments in chronological order, each with its Replies. */
  async list(collaborator: Collaborator, number: number) {
    const { idea, actor } = await this.ideas.access(collaborator, { number });
    const rows = await this.query().where(eq(comments.ideaId, idea.id));
    const files = await this.attachmentStore.ofComments(rows.map(({ comment }) => comment.id));

    const replies = new Map<string, CommentWithNames[]>();
    for (const row of rows) {
      const parent = row.comment.replyToId;
      if (parent) replies.set(parent, [...(replies.get(parent) ?? []), row]);
    }
    return rows
      .filter((row) => !row.comment.replyToId)
      .map((row) => ({
        ...this.present(row, idea, actor, files),
        replies: (replies.get(row.comment.id) ?? []).map((reply) =>
          this.present(reply, idea, actor, files),
        ),
      }));
  }

  async create(
    collaborator: Collaborator,
    number: number,
    data: { text: string; replyToId?: string },
  ) {
    const { idea, actor } = await this.ideas.access(collaborator, { number });
    const repliedTo = data.replyToId ? await this.find(data.replyToId, idea.id) : undefined;
    assertCanComment(idea, repliedTo && forRules(repliedTo));

    const id = await this.db.transaction(async (tx) => {
      const { text, mentioned } = await this.prepareText(tx, data.text);
      const [comment] = await tx
        .insert(comments)
        .values({ ideaId: idea.id, authorId: collaborator.id, replyToId: repliedTo?.id, text })
        .returning({ id: comments.id });
      await this.recordMentions(tx, comment!.id, mentioned);
      // Commenting follows the Idea.
      await this.notifications.follow(tx, idea.id, collaborator.id);
      await this.notifications.onCommented(tx, {
        idea,
        commentId: comment!.id,
        actorId: collaborator.id,
        repliedToAuthorId: repliedTo?.authorId,
        mentioned,
      });
      return comment!.id;
    });
    return this.detail(id, idea, actor);
  }

  async update(collaborator: Collaborator, id: string, data: { text: string }) {
    const { comment, idea, actor } = await this.access(collaborator, id);
    assertCanEditComment(forRules(comment), actor);

    await this.db.transaction(async (tx) => {
      const { text, mentioned } = await this.prepareText(tx, data.text);
      await tx.update(comments).set({ text, editedAt: new Date() }).where(eq(comments.id, id));
      const previous = await tx
        .delete(mentions)
        .where(eq(mentions.commentId, id))
        .returning({ id: mentions.collaboratorId });
      await this.recordMentions(tx, id, mentioned);
      await this.notifications.onMentionedInEdit(tx, {
        idea,
        commentId: id,
        actorId: collaborator.id,
        added: mentioned.filter((person) => !previous.some((p) => p.id === person)),
      });
    });
    return this.detail(id, idea, actor);
  }

  /** Becomes "comment removed": text and Mentions are erased, Replies stay. */
  async remove(collaborator: Collaborator, id: string) {
    const { comment, actor } = await this.access(collaborator, id);
    assertCanRemoveComment(forRules(comment), actor);

    const keys = await this.db.transaction(async (tx) => {
      await tx.update(comments).set({ text: '', removedAt: new Date() }).where(eq(comments.id, id));
      await tx.delete(mentions).where(eq(mentions.commentId, id));
      return this.attachmentStore.detachFromComment(id, tx);
    });
    await this.attachmentStore.removeFiles(keys);
  }

  async hide(collaborator: Collaborator, id: string, data: { reason: string }) {
    const { comment, idea, actor } = await this.access(collaborator, id);
    assertCanHideComment(forRules(comment), idea, actor, data.reason);

    await this.db
      .update(comments)
      .set({ hiddenAt: new Date(), hiddenById: collaborator.id, hiddenReason: data.reason })
      .where(eq(comments.id, id));
    return this.detail(id, idea, actor);
  }

  // ---------- support ----------

  private query() {
    const author = alias(collaborators, 'author');
    const hiddenBy = alias(collaborators, 'hidden_by');
    return this.db
      .select({
        comment: comments,
        author: { id: author.id, name: author.name },
        hiddenBy: { id: hiddenBy.id, name: hiddenBy.name },
      })
      .from(comments)
      .innerJoin(author, eq(comments.authorId, author.id))
      .leftJoin(hiddenBy, eq(comments.hiddenById, hiddenBy.id))
      .orderBy(asc(comments.createdAt))
      .$dynamic();
  }

  private async detail(id: string, idea: IdeaForRules & IdeaAuthorship, actor: Actor) {
    const [row] = await this.query().where(eq(comments.id, id));
    const files = await this.attachmentStore.ofComments([id]);
    return { ...this.present(row!, idea, actor, files), replies: [] };
  }

  private present(
    { comment, author, hiddenBy }: CommentWithNames,
    idea: IdeaForRules & IdeaAuthorship,
    actor: Actor,
    files: Map<string, ReturnType<typeof presentAttachment>[]>,
  ) {
    const rules = forRules(comment);
    const state = rules.removed ? 'removed' : rules.hidden ? 'hidden' : 'published';
    return {
      id: comment.id,
      // Whoever wrote the Idea with a hidden name stays hidden in their own Comments there.
      author: presentPerson(idea, author, actor.id, viewerLocale(this.env.SIM_LOCALE)),
      text: canReadText(rules, idea, actor) ? comment.text : null,
      state,
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
      // Whoever cannot read the text does not get the files either.
      attachments: canReadText(rules, idea, actor) ? (files.get(comment.id) ?? []) : [],
      hiding:
        state === 'hidden' && hiddenBy && comment.hiddenAt
          ? { reason: comment.hiddenReason ?? '', by: hiddenBy, at: comment.hiddenAt.toISOString() }
          : null,
      permissions: commentPermissions(rules, idea, actor),
    } as const;
  }

  private async find(id: string, ideaId?: string) {
    const [comment] = await this.db
      .select()
      .from(comments)
      .where(ideaId ? and(eq(comments.id, id), eq(comments.ideaId, ideaId)) : eq(comments.id, id));
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  private async access(collaborator: Collaborator, id: string) {
    const comment = await this.find(id);
    const { idea, actor } = await this.ideas.access(collaborator, { id: comment.ideaId });
    return { comment, idea, actor };
  }

  /** Only active Collaborators can be mentioned; any other markup becomes plain text. */
  private async prepareText(tx: Transaction, text: string) {
    const ids = mentionedIds(text);
    const mentionable = ids.length
      ? await tx
          .select({ id: collaborators.id, name: collaborators.name })
          .from(collaborators)
          .where(and(inArray(collaborators.id, ids), eq(collaborators.active, true)))
      : [];
    return normalizeMentions(text, new Map(mentionable.map(({ id, name }) => [id, name])));
  }

  private async recordMentions(tx: Transaction, commentId: string, mentioned: string[]) {
    if (!mentioned.length) return;
    await tx
      .insert(mentions)
      .values(mentioned.map((collaboratorId) => ({ commentId, collaboratorId })));
  }
}
