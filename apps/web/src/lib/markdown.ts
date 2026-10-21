/**
 * Long texts (Long Text fields and Comments) are Markdown. Before the editor, they were plain
 * text, and plain text is valid Markdown, except for one thing: a "<" was text, not HTML. The
 * editor and the reader both read it as text (code keeps it as written).
 */
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;

export function withoutHtml(markdown: string): string {
  return markdown
    .split(CODE)
    .map((part, index) => (index % 2 ? part : part.replaceAll('<', '\\<')))
    .join('');
}

/** Mentions travel as `@[Name](id)`; the reader shows them as "@Name". */
export const MENTION = /@\[([^\]\n]+)\]\(([0-9a-f-]{36})\)/gi;
