import { type AttachmentDtoOutput, useMentionableSearch } from '@sim/api-client';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import {
  type FormEvent,
  useDeferredValue,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AttachmentList, FilePicker } from '@/components/attachments';
import { EditorFrame } from '@/components/markdown-editor';
import { Button } from '@/components/ui/button';
import { useFilesProblem } from '@/lib/attachments';
import { MentionNode } from '@/lib/mention-node';
import { useMarkdownEditor } from '@/lib/use-markdown-editor';
import { cn } from '@/lib/utils';

interface Mentioned {
  id: string;
  name: string;
}

interface Props {
  label: string;
  submitLabel: string;
  /** Initial text, in Markdown with Mention markup (editing). */
  initial?: string;
  sending: boolean;
  error?: string;
  /** Rejects on error, so the typed text is not lost. */
  onSubmit: (text: string, files: File[]) => Promise<{ failed: number } | void>;
  /** Files the Comment already has (editing). */
  existingAttachments?: AttachmentDtoOutput[];
  onRemoveAttachment?: (attachment: AttachmentDtoOutput) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

/** What "@" started: the name typed so far, and how to put the chosen person in its place. */
interface Typing {
  query: string;
  pick: (person: Mentioned) => void;
}

export function CommentEditor({
  label,
  submitLabel,
  initial = '',
  sending,
  error,
  onSubmit,
  onCancel,
  autoFocus,
  existingAttachments = [],
  onRemoveAttachment,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState(initial);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string>();
  const filesProblem = useFilesProblem(files, existingAttachments.length);
  const search = useDeferredValue(typing?.query ?? null);

  const { data } = useMentionableSearch(
    { search: search ?? '' },
    { query: { enabled: search !== null, staleTime: 30_000 } },
  );
  const suggestions = typing ? (data?.data ?? []) : [];
  const open = suggestions.length > 0;

  // The suggestion plugin calls back outside React: it reads the latest list through a ref.
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  function onSuggestionKey(event: KeyboardEvent) {
    if (!open || !typing) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => (current + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      typing.pick(suggestions[highlighted]!);
      return true;
    }
    if (event.key === 'Escape') {
      setTyping(null);
      return true;
    }
    return false;
  }
  useLayoutEffect(() => {
    keys.current = onSuggestionKey;
  });

  const extensions = useMemo(
    () => [
      MentionNode.configure({
        HTMLAttributes: { class: 'tiptap-mention' },
        renderText: ({ node }) => `@${node.attrs.label}`,
        renderHTML: ({ node, options }) => [
          'span',
          { ...options.HTMLAttributes, 'data-type': 'mention' },
          `@${node.attrs.label}`,
        ],
        suggestion: {
          render: () => {
            const follow = ({ query, command }: SuggestionProps) => {
              setTyping({
                query,
                pick: (person) => command({ id: person.id, label: person.name }),
              });
              setHighlighted(0);
            };
            return {
              onStart: follow,
              onUpdate: follow,
              onKeyDown: ({ event }: SuggestionKeyDownProps) => keys.current(event),
              onExit: () => setTyping(null),
            };
          },
        },
      }),
    ],
    [],
  );

  const listId = `${id}-suggestions`;
  const editor = useMarkdownEditor({
    initial,
    onChange: setText,
    placeholder: label,
    autoFocus,
    extensions,
    attributes: {
      role: 'combobox',
      'aria-label': label,
      'aria-expanded': String(open),
      'aria-controls': listId,
      'aria-autocomplete': 'list',
      ...(open && { 'aria-activedescendant': `${listId}-${highlighted}` }),
    },
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text || filesProblem) return;
    setNotice(undefined);
    try {
      const result = await onSubmit(text, files);
      editor.commands.clearContent(true);
      setFiles([]);
      if (result?.failed) setNotice(t('attachments.failed'));
    } catch {
      // The error arrives through the `error` prop; the text stays for another try.
    }
  }

  return (
    <form className="grid gap-2" onSubmit={submit}>
      <div className="relative">
        <EditorFrame editor={editor} />
        <ul
          id={listId}
          role="listbox"
          aria-label={t('comments.suggestions')}
          hidden={!open}
          className="absolute z-10 mt-1 w-64 overflow-hidden rounded-md border bg-popover p-1 shadow-md"
        >
          {suggestions.map((person, index) => (
            <li
              key={person.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              className={cn(
                'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                index === highlighted && 'bg-accent text-accent-foreground',
              )}
              // mousedown, not click: a click would take the focus from the editor first.
              onMouseDown={(event) => {
                event.preventDefault();
                typing?.pick(person);
              }}
            >
              {person.name}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{t('comments.mentionHelp')}</p>
      <AttachmentList attachments={existingAttachments} onRemove={onRemoveAttachment} />
      <FilePicker files={files} onChange={setFiles} existing={existingAttachments.length} />
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!text || sending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('comments.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
