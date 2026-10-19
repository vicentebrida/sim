/**
 * Mentions travel in the API as `@[Name](id)`. On screen and in the editor they show as "@Name";
 * when sending, the Mentions picked from the suggestion list become markup again.
 */
export interface Mentioned {
  id: string;
  name: string;
}

export type Segment = { type: 'text'; value: string } | ({ type: 'mention' } & Mentioned);

const MARKUP = /@\[([^\]\n]+)\]\(([0-9a-f-]{36})\)/gi;

export function segment(text: string): Segment[] {
  const segments: Segment[] = [];
  let position = 0;
  for (const markup of text.matchAll(MARKUP)) {
    if (markup.index > position) {
      segments.push({ type: 'text', value: text.slice(position, markup.index) });
    }
    segments.push({ type: 'mention', name: markup[1]!, id: markup[2]! });
    position = markup.index + markup[0].length;
  }
  if (position < text.length) segments.push({ type: 'text', value: text.slice(position) });
  return segments;
}

/** Text for the editor ("@Name") and the Mentions it contains. */
export function toEditable(text: string): { text: string; mentioned: Mentioned[] } {
  const mentioned = new Map<string, Mentioned>();
  const plain = segment(text)
    .map((part) => {
      if (part.type === 'text') return part.value;
      mentioned.set(part.id, { id: part.id, name: part.name });
      return `@${part.name}`;
    })
    .join('');
  return { text: plain, mentioned: [...mentioned.values()] };
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Turns "@Name" back into `@[Name](id)`, only for people picked who are still in the text. */
export function toMarkup(text: string, mentioned: readonly Mentioned[]): string {
  // Longest names first, so "@Ana Souza" is not caught as "@Ana".
  const byLength = [...mentioned].sort((a, b) => b.name.length - a.name.length);
  if (!byLength.length) return text;
  const pattern = new RegExp(
    `@(${byLength.map(({ name }) => escapeRegex(name)).join('|')})(?![\\p{L}\\p{N}])`,
    'gu',
  );
  return text.replace(pattern, (match, name: string) => {
    const person = byLength.find((m) => m.name === name);
    return person ? `@[${person.name}](${person.id})` : match;
  });
}
