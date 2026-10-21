/**
 * Who receives each Notification (PRD §3.8). Plain code: the service only fetches the people
 * involved and stores the result. General rule: nobody is notified of what they did themselves.
 */

export const NOTIFICATION_TYPES = [
  'status',
  'duplicate',
  'comment',
  'reply',
  'mention',
  'new_idea',
  'stalled',
  'stalled_escalated',
  'archive_warning',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Follower {
  id: string;
  /** Collaborator preference; when off, they are not told about new Comments. */
  wantsNewComments: boolean;
}

/**
 * A Comment produces at most one Notification per person, the most specific one: Mention, then
 * Reply (for whoever wrote the Comment replied to), then new Comment (Followers).
 */
export function commentRecipients(event: {
  actorId: string;
  followers: readonly Follower[];
  repliedToAuthorId?: string;
  mentioned: readonly string[];
}): Map<string, 'comment' | 'reply' | 'mention'> {
  const recipients = new Map<string, 'comment' | 'reply' | 'mention'>();
  for (const follower of event.followers) {
    if (follower.wantsNewComments) recipients.set(follower.id, 'comment');
  }
  if (event.repliedToAuthorId) recipients.set(event.repliedToAuthorId, 'reply');
  for (const mentioned of event.mentioned) recipients.set(mentioned, 'mention');
  recipients.delete(event.actorId);
  return recipients;
}

/** Status changes notify the Followers; a new Idea notifies the Category Reviewers. */
export function recipientsExcept(actorId: string, candidates: readonly string[]): string[] {
  return [...new Set(candidates)].filter((id) => id !== actorId);
}
