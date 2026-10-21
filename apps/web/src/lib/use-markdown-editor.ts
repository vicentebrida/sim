import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { type Extensions, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { withoutHtml } from '@/lib/markdown';

/** Links the editor accepts (and the formatted text shows). */
export const LINK = /^(https?:\/\/|mailto:)/i;

const BASE_ATTRIBUTES = {
  class: 'markdown min-h-20 px-3 py-2 text-base outline-none md:text-sm [&_p]:min-h-[1lh]',
  'aria-multiline': 'true',
};

interface EditorOptions {
  /** Markdown the editor starts with. */
  initial: string;
  onChange: (markdown: string) => void;
  /** Attributes of the editable area (role, accessible name, aria-*). */
  attributes: Record<string, string>;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  extensions?: Extensions;
}

/**
 * A Tiptap editor that reads and writes Markdown. It holds its own content and reports each
 * change through `onChange` (not controlled: a late re-render would undo fast typing).
 */
export function useMarkdownEditor({
  initial,
  onChange,
  attributes,
  placeholder,
  autoFocus,
  onBlur,
  extensions = [],
}: EditorOptions) {
  const callbacks = useRef({ onChange, onBlur });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onBlur };
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Underline has no Markdown; links open only from the formatted text, not while editing.
        underline: false,
        link: {
          openOnClick: false,
          isAllowedUri: (url) => LINK.test(url),
          protocols: ['mailto'],
        },
      }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      ...extensions,
    ],
    content: withoutHtml(initial),
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: { attributes: { ...BASE_ATTRIBUTES, ...attributes } },
    onUpdate: ({ editor }) =>
      callbacks.current.onChange(editor.isEmpty ? '' : editor.getMarkdown().trim()),
    onBlur: () => callbacks.current.onBlur?.(),
  });

  // The accessible name and states change (e.g. a suggestion list opening).
  const attributeKey = JSON.stringify(attributes);
  useEffect(() => {
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: { ...BASE_ATTRIBUTES, ...attributes },
      },
    });
    // `attributes` is a new object every render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, attributeKey]);

  return editor;
}
