import Mention from '@tiptap/extension-mention';

const MARKUP = /^@\[([^\]\n]+)\]\(([0-9a-f-]{36})\)/i;

/** Mentions in the editor, written in Markdown as `@[Name](id)` (the format of the API). */
export const MentionNode = Mention.extend({
  markdownTokenName: 'mention',
  markdownTokenizer: {
    name: 'mention',
    level: 'inline',
    start: (src: string) => src.indexOf('@['),
    tokenize: (src: string) => {
      const markup = MARKUP.exec(src);
      if (!markup) return undefined;
      return { type: 'mention', raw: markup[0], label: markup[1], id: markup[2] };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode('mention', { id: token.id, label: token.label }),
  renderMarkdown: (node) => `@[${node.attrs?.label}](${node.attrs?.id})`,
});
