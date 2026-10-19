/**
 * Comment rules (PRD §3.6). Like the Idea rules, plain code tested in isolation.
 */
import { DomainError } from '../../common/domain-error';
import {
  type Actor,
  allows,
  canReview,
  type IdeaForRules,
  requireJustification,
} from '../../ideas/domain/idea';

export interface CommentForRules {
  authorId: string;
  /** Comment being replied to; null when the Comment is not a Reply. */
  replyToId: string | null;
  removed: boolean;
  hidden: boolean;
}

const isAuthor = (comment: CommentForRules, actor: Actor) => comment.authorId === actor.id;

const unavailable = (message: string) => new DomainError('COMMENT_UNAVAILABLE', message);

/** Any published Status takes Comments, including Declined and Archived. */
export function assertCanComment(idea: IdeaForRules, repliedTo?: CommentForRules) {
  if (idea.status === 'draft') throw unavailable('Drafts do not take Comments');
  if (!repliedTo) return;
  if (repliedTo.replyToId) {
    throw unavailable('Replies cannot be replied to; reply to the original Comment');
  }
  if (repliedTo.removed || repliedTo.hidden) {
    throw unavailable('This Comment no longer takes Replies');
  }
}

export function assertCanEditComment(comment: CommentForRules, actor: Actor) {
  if (!isAuthor(comment, actor)) {
    throw new DomainError('FORBIDDEN', 'Only the person who wrote it edits the Comment');
  }
  if (comment.removed || comment.hidden) {
    throw unavailable('A removed or hidden Comment cannot be edited');
  }
}

export function assertCanRemoveComment(comment: CommentForRules, actor: Actor) {
  if (!isAuthor(comment, actor)) {
    throw new DomainError('FORBIDDEN', 'Only the person who wrote it removes the Comment');
  }
  if (comment.removed) throw unavailable('The Comment was already removed');
}

/** Moderation: the same people who review the Idea (Category Reviewer, except the Author, or Administrator). */
export function assertCanHideComment(
  comment: CommentForRules,
  idea: IdeaForRules,
  actor: Actor,
  reason: string | undefined,
) {
  if (!canReview(idea, actor)) {
    throw new DomainError('FORBIDDEN', 'Only Category Reviewers or Administrators hide Comments');
  }
  if (comment.removed || comment.hidden) {
    throw unavailable('The Comment was already removed or hidden');
  }
  requireJustification(reason, 'A reason is required');
}

/**
 * Removed: nobody sees the text. Hidden: only the person who wrote it and the moderators, so the
 * moderation can be checked; everyone else only sees the reason.
 */
export function canReadText(comment: CommentForRules, idea: IdeaForRules, actor: Actor) {
  if (comment.removed) return false;
  if (!comment.hidden) return true;
  return isAuthor(comment, actor) || canReview(idea, actor);
}

export function commentPermissions(comment: CommentForRules, idea: IdeaForRules, actor: Actor) {
  return {
    canReply: allows(() => assertCanComment(idea, comment)),
    canEdit: allows(() => assertCanEditComment(comment, actor)),
    canRemove: allows(() => assertCanRemoveComment(comment, actor)),
    canHide: allows(() => assertCanHideComment(comment, idea, actor, 'reason')),
  };
}
