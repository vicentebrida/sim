/**
 * Mentions live in the Comment text as `@[Name](id)`: the web app shows just "@Name", and the id
 * identifies the person even when two Collaborators share a name.
 */
const MARKUP =
  /@\[([^\]\n]{1,120})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/** Changes the name shown in the Mentions of one person (used when erasing their identity). */
export function renameMention(text: string, id: string, name: string) {
  return text.replace(MARKUP, (markup, _old: string, found: string) =>
    found.toLowerCase() === id.toLowerCase() ? `@[${name}](${found.toLowerCase()})` : markup,
  );
}

export function mentionedIds(text: string): string[] {
  return [...new Set([...text.matchAll(MARKUP)].map((markup) => markup[2]!.toLowerCase()))];
}

/**
 * Refreshes the name of each mentioned Collaborator and turns Mentions of people who cannot be
 * mentioned (unknown or inactive) into plain text.
 */
export function normalizeMentions(text: string, mentionable: ReadonlyMap<string, string>) {
  const mentioned = new Set<string>();
  const normalized = text.replace(MARKUP, (_markup, name: string, id: string) => {
    const current = mentionable.get(id.toLowerCase());
    if (!current) return `@${name}`;
    mentioned.add(id.toLowerCase());
    return `@[${current}](${id.toLowerCase()})`;
  });
  return { text: normalized, mentioned: [...mentioned] };
}
