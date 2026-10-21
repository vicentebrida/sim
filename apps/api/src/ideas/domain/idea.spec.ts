import { describe, expect, it } from 'vitest';
import { DomainError } from '../../common/domain-error';
import {
  type Actor,
  assertCanChangeStatus,
  assertCanDelete,
  assertCanLike,
  assertCanRecategorize,
  assertCanTag,
  type IdeaForRules,
  permissions,
  STATUSES,
} from './idea';

const AUTHOR = 'author';
const idea = (status: IdeaForRules['status']): IdeaForRules => ({ status, authorId: AUTHOR });

const author: Actor = { id: AUTHOR, administrator: false, reviewsCategory: false };
const colleague: Actor = { id: 'colleague', administrator: false, reviewsCategory: false };
const reviewer: Actor = { id: 'reviewer', administrator: false, reviewsCategory: true };
const administrator: Actor = { id: 'admin', administrator: true, reviewsCategory: false };

const noInteraction = { hasInteractionFromOthers: false };

function errorCode(action: () => void) {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe('Status change', () => {
  const withJustification = { justification: 'Reviewed by the committee' };

  it.each([
    ['open', 'under_review'],
    ['open', 'archived'],
    ['under_review', 'approved'],
    ['under_review', 'declined'],
    ['under_review', 'archived'],
    ['approved', 'in_progress'],
    ['approved', 'declined'],
    ['in_progress', 'done'],
    ['in_progress', 'declined'],
    ['declined', 'under_review'],
    ['archived', 'open'],
  ] as const)('Reviewer moves from %s to %s', (from, to) => {
    expect(() => assertCanChangeStatus(idea(from), to, reviewer, withJustification)).not.toThrow();
  });

  it.each([
    ['open', 'approved'],
    ['open', 'declined'],
    ['approved', 'archived'],
    ['done', 'in_progress'],
    ['duplicate', 'open'],
    ['draft', 'under_review'],
    ['archived', 'under_review'],
  ] as const)('does not allow going from %s to %s', (from, to) => {
    expect(
      errorCode(() => assertCanChangeStatus(idea(from), to, reviewer, withJustification)),
    ).toBe('INVALID_TRANSITION');
  });

  it('requires a justification', () => {
    expect(
      errorCode(() =>
        assertCanChangeStatus(idea('open'), 'under_review', reviewer, { justification: '  ' }),
      ),
    ).toBe('JUSTIFICATION_REQUIRED');
  });

  it('only a Category Reviewer or an Administrator changes the Status', () => {
    for (const actor of [colleague, author]) {
      expect(
        errorCode(() =>
          assertCanChangeStatus(idea('open'), 'under_review', actor, withJustification),
        ),
      ).toBe('FORBIDDEN');
    }
    expect(() =>
      assertCanChangeStatus(idea('open'), 'under_review', administrator, withJustification),
    ).not.toThrow();
  });

  it('a Reviewer does not review their own Idea', () => {
    const authorWhoReviews: Actor = { ...reviewer, id: AUTHOR };
    expect(
      errorCode(() =>
        assertCanChangeStatus(idea('open'), 'under_review', authorWhoReviews, withJustification),
      ),
    ).toBe('FORBIDDEN');
  });

  it('an Administrator, as a last resort, may review their own Idea', () => {
    const adminAuthor: Actor = { ...administrator, id: AUTHOR };
    expect(() =>
      assertCanChangeStatus(idea('open'), 'under_review', adminAuthor, withJustification),
    ).not.toThrow();
  });

  describe('Duplicate', () => {
    it('may come from Open or Under review and requires the original Idea', () => {
      for (const from of ['open', 'under_review'] as const) {
        expect(() =>
          assertCanChangeStatus(idea(from), 'duplicate', reviewer, {
            ...withJustification,
            originalIdea: { id: 'other', status: 'open' },
          }),
        ).not.toThrow();
      }
      expect(
        errorCode(() =>
          assertCanChangeStatus(idea('open'), 'duplicate', reviewer, withJustification),
        ),
      ).toBe('INVALID_ORIGINAL_IDEA');
    });

    it('the original Idea cannot be itself, a Draft or another Duplicate', () => {
      const target = { ...idea('open'), id: 'this' };
      for (const originalIdea of [
        { id: 'this', status: 'open' as const },
        { id: 'other', status: 'draft' as const },
        { id: 'other', status: 'duplicate' as const },
      ]) {
        expect(
          errorCode(() =>
            assertCanChangeStatus(target, 'duplicate', reviewer, {
              ...withJustification,
              originalIdea,
            }),
          ),
        ).toBe('INVALID_ORIGINAL_IDEA');
      }
    });
  });
});

describe('recategorization', () => {
  it('Reviewers or Administrators recategorize published, unfinished Ideas, with justification', () => {
    for (const status of [
      'open',
      'under_review',
      'approved',
      'in_progress',
      'declined',
      'archived',
    ] as const) {
      expect(() =>
        assertCanRecategorize(idea(status), reviewer, 'Belongs to Processes'),
      ).not.toThrow();
    }
    expect(errorCode(() => assertCanRecategorize(idea('done'), reviewer, 'x'))).toBe(
      'CANNOT_RECATEGORIZE',
    );
    expect(errorCode(() => assertCanRecategorize(idea('open'), reviewer, ''))).toBe(
      'JUSTIFICATION_REQUIRED',
    );
    expect(errorCode(() => assertCanRecategorize(idea('open'), colleague, 'x'))).toBe('FORBIDDEN');
  });
});

describe('deletion by the Author', () => {
  it('a Draft can always be deleted', () => {
    expect(() =>
      assertCanDelete(idea('draft'), author, { hasInteractionFromOthers: true }),
    ).not.toThrow();
  });

  it('an Open Idea can only be deleted if nobody else interacted', () => {
    expect(() => assertCanDelete(idea('open'), author, noInteraction)).not.toThrow();
    expect(
      errorCode(() => assertCanDelete(idea('open'), author, { hasInteractionFromOthers: true })),
    ).toBe('DELETE_BLOCKED');
  });

  it('from Under review on it cannot be deleted', () => {
    expect(errorCode(() => assertCanDelete(idea('under_review'), author, noInteraction))).toBe(
      'DELETE_BLOCKED',
    );
  });

  it('only the Author deletes', () => {
    expect(errorCode(() => assertCanDelete(idea('draft'), administrator, noInteraction))).toBe(
      'FORBIDDEN',
    );
  });
});

describe('Likes', () => {
  const likeable = ['open', 'under_review', 'approved', 'in_progress'] as const;

  it('colleagues, Reviewers and Administrators like Ideas in progress', () => {
    for (const status of likeable) {
      for (const actor of [colleague, reviewer, administrator]) {
        expect(errorCode(() => assertCanLike(idea(status), actor))).toBeUndefined();
      }
    }
  });

  it('the Author does not like their own Idea', () => {
    expect(errorCode(() => assertCanLike(idea('open'), author))).toBe('FORBIDDEN');
  });

  it('in the other Statuses Likes are frozen', () => {
    const frozen = STATUSES.filter((status) => !(likeable as readonly string[]).includes(status));
    expect(frozen).toEqual(['draft', 'done', 'declined', 'duplicate', 'archived']);
    for (const status of frozen) {
      expect(errorCode(() => assertCanLike(idea(status), colleague))).toBe('LIKE_UNAVAILABLE');
    }
  });
});

describe('Tags', () => {
  it('the Author tags while the text is editable', () => {
    expect(errorCode(() => assertCanTag(idea('draft'), author))).toBeUndefined();
    expect(errorCode(() => assertCanTag(idea('open'), author))).toBeUndefined();
    expect(errorCode(() => assertCanTag(idea('under_review'), author))).toBe('EDIT_LOCKED');
  });

  it('Reviewers and Administrators tag any published Idea, but not a colleague', () => {
    for (const status of ['open', 'under_review', 'done', 'archived'] as const) {
      expect(errorCode(() => assertCanTag(idea(status), reviewer))).toBeUndefined();
      expect(errorCode(() => assertCanTag(idea(status), administrator))).toBeUndefined();
    }
    expect(errorCode(() => assertCanTag(idea('open'), colleague))).toBe('FORBIDDEN');
  });
});

describe('permissions computed for the web app', () => {
  it('the Author of an Open Idea can edit and delete, but not review or like', () => {
    expect(permissions(idea('open'), author, noInteraction)).toEqual({
      canView: true,
      canEdit: true,
      canDelete: true,
      canPublish: false,
      canTag: true,
      canSetStage: false,
      canLike: false,
      canReview: false,
      canRecategorize: false,
      transitions: [],
    });
  });

  it('from Under review on the text is locked for the Author', () => {
    expect(permissions(idea('under_review'), author, noInteraction).canEdit).toBe(false);
  });

  it('a Draft is visible only to its Author', () => {
    expect(permissions(idea('draft'), author, noInteraction)).toMatchObject({
      canView: true,
      canPublish: true,
    });
    expect(permissions(idea('draft'), administrator, noInteraction).canView).toBe(false);
  });

  it('a Reviewer sees the possible transitions from the current Status', () => {
    expect(permissions(idea('under_review'), reviewer, noInteraction).transitions).toEqual([
      'approved',
      'declined',
      'duplicate',
      'archived',
    ]);
  });

  it('a colleague can like an Open Idea', () => {
    expect(permissions(idea('open'), colleague, noInteraction).canLike).toBe(true);
    expect(permissions(idea('done'), colleague, noInteraction).canLike).toBe(false);
  });
});
