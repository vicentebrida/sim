import { createHash } from 'node:crypto';

/**
 * Hidden authorship (PRD §3.10). Everyone but the Author sees the same stand-in for the Author of
 * an Idea: a fixed name and an id made from the Idea alone, which says nothing about the real id
 * but still lets the web app tell "the Author of this Idea" apart from other people.
 */
export interface AuthorRef {
  id: string;
  name: string;
}

export interface IdeaAuthorship {
  id: string;
  authorId: string;
  hiddenAuthorship: boolean;
}

export const anonymousName = (locale: string) =>
  locale === 'en' ? 'Anonymous collaborator' : 'Colaborador anônimo';

export function anonymousId(ideaId: string): string {
  const hex = createHash('sha256').update(`anonymous-author:${ideaId}`).digest('hex');
  // Shaped like a v4 UUID so it passes the same validation as any other id.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Whether `viewerId` must not learn who `personId` is, in the context of this Idea. */
export function hidesAuthor(idea: IdeaAuthorship, personId: string, viewerId: string) {
  return idea.hiddenAuthorship && personId === idea.authorId && viewerId !== idea.authorId;
}

/** The person as `viewerId` may see them in this Idea (the Author's name stays hidden). */
export function presentPerson(
  idea: IdeaAuthorship,
  person: AuthorRef,
  viewerId: string,
  locale: string,
): AuthorRef {
  return hidesAuthor(idea, person.id, viewerId)
    ? { id: anonymousId(idea.id), name: anonymousName(locale) }
    : person;
}
