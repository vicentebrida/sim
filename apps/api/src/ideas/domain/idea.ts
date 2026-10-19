/**
 * Idea lifecycle rules (PRD §3.2–3.3, ADR-0004). Plain code, no NestJS or database, so the rules
 * are tested in isolation and read in a single place.
 */
import { DomainError } from '../../common/domain-error';

export const STATUSES = [
  'draft',
  'open',
  'under_review',
  'approved',
  'in_progress',
  'done',
  'declined',
  'duplicate',
  'archived',
] as const;

export type Status = (typeof STATUSES)[number];

/** Transitions made by a Reviewer or Administrator. Draft → Open is publishing, done by the Author. */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  draft: [],
  open: ['under_review', 'duplicate', 'archived'],
  under_review: ['approved', 'declined', 'duplicate', 'archived'],
  // Once approved it is not archived: giving up is a decision on merit (Declined).
  approved: ['in_progress', 'declined'],
  in_progress: ['done', 'declined'],
  done: [],
  declined: ['under_review'],
  duplicate: [],
  archived: ['open'],
};

/** Statuses the Administrator can turn off; Ideas skip them (ADR-0004). */
export const OPTIONAL_STATUSES = ['approved', 'in_progress'] as const satisfies readonly Status[];

/**
 * Where a Reviewer can take an Idea from `status`. A turned-off Status is replaced by where it
 * would lead (Under review → Approved becomes Under review → In progress, or Done).
 */
export function transitionsFrom(status: Status, disabled: readonly Status[] = []): Status[] {
  const expand = (target: Status): Status[] =>
    disabled.includes(target) ? TRANSITIONS[target].flatMap(expand) : [target];
  return [...new Set(TRANSITIONS[status].flatMap(expand))];
}

/** Statuses in which the Author can still edit the text; from Under review on, news go in Comments. */
const EDITABLE: readonly Status[] = ['draft', 'open'];

/** Statuses in which the Idea receives (and loses) Likes; in the others they are frozen. */
const LIKEABLE: readonly Status[] = ['open', 'under_review', 'approved', 'in_progress'];

const RECATEGORIZABLE: readonly Status[] = [
  'open',
  'under_review',
  'approved',
  'in_progress',
  'declined',
  'archived',
];

/**
 * "Trending": each event (the publication and each Like or Comment) is worth 1 and loses half its
 * weight every half-life, so recent support counts more than old support.
 */
export const TRENDING_HALF_LIFE_DAYS = 7;

/** List orderings; "trending" is the default. */
export const SORT_ORDERS = ['trending', 'most_liked', 'newest'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface IdeaForRules {
  id?: string;
  status: Status;
  authorId: string;
}

export interface Actor {
  id: string;
  administrator: boolean;
  /** Is a Reviewer of the Category of the Idea at hand. */
  reviewsCategory: boolean;
}

const isAuthor = (idea: IdeaForRules, actor: Actor) => idea.authorId === actor.id;

/** Administrators always; Category Reviewers, except on their own Ideas (conflict of interest). */
export function canReview(idea: IdeaForRules, actor: Actor) {
  return actor.administrator || (actor.reviewsCategory && !isAuthor(idea, actor));
}

export function requireJustification(
  justification: string | undefined,
  message = 'Justification is required',
) {
  if (!justification?.trim()) throw new DomainError('JUSTIFICATION_REQUIRED', message);
}

export function assertCanChangeStatus(
  idea: IdeaForRules,
  to: Status,
  actor: Actor,
  data: { justification?: string; originalIdea?: { id: string; status: Status } },
  disabled: readonly Status[] = [],
) {
  if (!canReview(idea, actor)) {
    throw new DomainError(
      'FORBIDDEN',
      'Only Category Reviewers or Administrators change the Status',
    );
  }
  if (!transitionsFrom(idea.status, disabled).includes(to)) {
    throw new DomainError('INVALID_TRANSITION', `Cannot go from ${idea.status} to ${to}`);
  }
  requireJustification(data.justification);

  if (to === 'duplicate') {
    const original = data.originalIdea;
    if (
      !original ||
      original.id === idea.id ||
      original.status === 'draft' ||
      original.status === 'duplicate'
    ) {
      throw new DomainError(
        'INVALID_ORIGINAL_IDEA',
        'The original Idea must be published, different from this one and not a Duplicate',
      );
    }
  }
}

export function assertCanRecategorize(idea: IdeaForRules, actor: Actor, justification: string) {
  if (!canReview(idea, actor)) {
    throw new DomainError('FORBIDDEN', 'Only Category Reviewers or Administrators recategorize');
  }
  if (!RECATEGORIZABLE.includes(idea.status)) {
    throw new DomainError('CANNOT_RECATEGORIZE', 'This Idea can no longer change Category');
  }
  requireJustification(justification);
}

export function assertCanEdit(idea: IdeaForRules, actor: Actor) {
  if (!isAuthor(idea, actor)) throw new DomainError('FORBIDDEN', 'Only the Author edits the Idea');
  if (!EDITABLE.includes(idea.status)) {
    throw new DomainError('EDIT_LOCKED', 'The Idea is under review; add information as Comments');
  }
}

export function assertCanPublish(idea: IdeaForRules, actor: Actor) {
  if (!isAuthor(idea, actor)) {
    throw new DomainError('FORBIDDEN', 'Only the Author publishes the Idea');
  }
  if (idea.status !== 'draft') {
    throw new DomainError('ALREADY_PUBLISHED', 'The Idea is already published');
  }
}

export function assertCanDelete(
  idea: IdeaForRules,
  actor: Actor,
  context: { hasInteractionFromOthers: boolean },
) {
  if (!isAuthor(idea, actor)) {
    throw new DomainError('FORBIDDEN', 'Only the Author deletes the Idea');
  }
  const allowed =
    idea.status === 'draft' || (idea.status === 'open' && !context.hasInteractionFromOthers);
  if (!allowed) {
    throw new DomainError(
      'DELETE_BLOCKED',
      'Other people already interacted with this Idea; ask for it to be archived in a Comment',
    );
  }
}

/** Applies to liking and to removing the Like. */
export function assertCanLike(idea: IdeaForRules, actor: Actor) {
  if (isAuthor(idea, actor)) {
    throw new DomainError('FORBIDDEN', 'The Author does not like their own Idea');
  }
  if (!LIKEABLE.includes(idea.status)) {
    throw new DomainError('LIKE_UNAVAILABLE', 'Likes on this Idea are frozen by its Status');
  }
}

export function canView(idea: IdeaForRules, actor: Actor) {
  return idea.status !== 'draft' || isAuthor(idea, actor);
}

export function allows(check: () => void) {
  try {
    check();
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}

/** What the Actor can do with the Idea, so the web app only shows valid actions. */
export function permissions(
  idea: IdeaForRules,
  actor: Actor,
  context: { hasInteractionFromOthers: boolean; disabledStatuses?: readonly Status[] },
) {
  const reviews = idea.status !== 'draft' && canReview(idea, actor);
  return {
    canView: canView(idea, actor),
    canEdit: allows(() => assertCanEdit(idea, actor)),
    canDelete: allows(() => assertCanDelete(idea, actor, context)),
    canPublish: allows(() => assertCanPublish(idea, actor)),
    canLike: allows(() => assertCanLike(idea, actor)),
    canReview: reviews,
    canRecategorize: reviews && RECATEGORIZABLE.includes(idea.status),
    transitions: reviews ? transitionsFrom(idea.status, context.disabledStatuses) : [],
  };
}
