import { describe, expect, it } from 'vitest';
import { DomainError } from '../../common/domain-error';
import type { Actor, IdeaForRules } from '../../ideas/domain/idea';
import {
  assertCanComment,
  assertCanEditComment,
  assertCanHideComment,
  assertCanRemoveComment,
  canReadText,
  type CommentForRules,
  commentPermissions,
} from './comment';

const idea = (status: IdeaForRules['status'] = 'open'): IdeaForRules => ({
  status,
  authorId: 'idea-author',
});

const writer: Actor = { id: 'writer', administrator: false, reviewsCategory: false };
const colleague: Actor = { id: 'colleague', administrator: false, reviewsCategory: false };
const reviewer: Actor = { id: 'reviewer', administrator: false, reviewsCategory: true };
const administrator: Actor = { id: 'admin', administrator: true, reviewsCategory: false };
const ideaAuthorWhoReviews: Actor = {
  id: 'idea-author',
  administrator: false,
  reviewsCategory: true,
};

const comment = (partial: Partial<CommentForRules> = {}): CommentForRules => ({
  authorId: writer.id,
  replyToId: null,
  removed: false,
  hidden: false,
  ...partial,
});

function errorCode(action: () => void) {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe('new Comment', () => {
  it('works on any published Status, including Declined and Archived', () => {
    for (const status of ['open', 'done', 'declined', 'archived', 'duplicate'] as const) {
      expect(errorCode(() => assertCanComment(idea(status)))).toBeUndefined();
    }
    expect(errorCode(() => assertCanComment(idea('draft')))).toBe('COMMENT_UNAVAILABLE');
  });

  it('Replies have a single level', () => {
    expect(errorCode(() => assertCanComment(idea(), comment()))).toBeUndefined();
    expect(errorCode(() => assertCanComment(idea(), comment({ replyToId: 'other' })))).toBe(
      'COMMENT_UNAVAILABLE',
    );
  });

  it('removed or hidden Comments are not replied to', () => {
    for (const state of [{ removed: true }, { hidden: true }]) {
      expect(errorCode(() => assertCanComment(idea(), comment(state)))).toBe('COMMENT_UNAVAILABLE');
    }
  });
});

describe('editing and removal by the person who wrote it', () => {
  it('only they edit and remove', () => {
    expect(errorCode(() => assertCanEditComment(comment(), writer))).toBeUndefined();
    expect(errorCode(() => assertCanRemoveComment(comment(), writer))).toBeUndefined();
    for (const actor of [colleague, administrator]) {
      expect(errorCode(() => assertCanEditComment(comment(), actor))).toBe('FORBIDDEN');
      expect(errorCode(() => assertCanRemoveComment(comment(), actor))).toBe('FORBIDDEN');
    }
  });

  it('a hidden Comment cannot be edited, but its writer can still remove it', () => {
    const hidden = comment({ hidden: true });
    expect(errorCode(() => assertCanEditComment(hidden, writer))).toBe('COMMENT_UNAVAILABLE');
    expect(errorCode(() => assertCanRemoveComment(hidden, writer))).toBeUndefined();
  });

  it('a removed Comment is not edited or removed again', () => {
    const removed = comment({ removed: true });
    expect(errorCode(() => assertCanEditComment(removed, writer))).toBe('COMMENT_UNAVAILABLE');
    expect(errorCode(() => assertCanRemoveComment(removed, writer))).toBe('COMMENT_UNAVAILABLE');
  });
});

describe('hiding', () => {
  it('Category Reviewers or Administrators hide, with a reason', () => {
    for (const actor of [reviewer, administrator]) {
      expect(
        errorCode(() => assertCanHideComment(comment(), idea(), actor, 'Offensive')),
      ).toBeUndefined();
    }
    expect(errorCode(() => assertCanHideComment(comment(), idea(), reviewer, ' '))).toBe(
      'JUSTIFICATION_REQUIRED',
    );
  });

  it('colleagues do not hide, nor a Reviewer on their own Idea', () => {
    expect(errorCode(() => assertCanHideComment(comment(), idea(), colleague, 'x'))).toBe(
      'FORBIDDEN',
    );
    expect(
      errorCode(() => assertCanHideComment(comment(), idea(), ideaAuthorWhoReviews, 'x')),
    ).toBe('FORBIDDEN');
  });

  it('hidden text stays visible only to its writer and to moderators', () => {
    const hidden = comment({ hidden: true });
    expect(canReadText(hidden, idea(), writer)).toBe(true);
    expect(canReadText(hidden, idea(), reviewer)).toBe(true);
    expect(canReadText(hidden, idea(), colleague)).toBe(false);
    expect(canReadText(comment({ removed: true }), idea(), writer)).toBe(false);
  });
});

describe('permissions computed for the web app', () => {
  it('the writer edits, removes and replies; moderators also hide', () => {
    expect(commentPermissions(comment(), idea(), writer)).toEqual({
      canReply: true,
      canEdit: true,
      canRemove: true,
      canHide: false,
    });
    expect(commentPermissions(comment(), idea(), reviewer)).toEqual({
      canReply: true,
      canEdit: false,
      canRemove: false,
      canHide: true,
    });
  });

  it('a Reply does not offer replying', () => {
    expect(commentPermissions(comment({ replyToId: 'parent' }), idea(), colleague).canReply).toBe(
      false,
    );
  });
});
