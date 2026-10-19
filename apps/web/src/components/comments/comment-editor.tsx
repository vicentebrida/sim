import { useMentionableSearch } from '@sim/api-client';
import {
  type FormEvent,
  type KeyboardEvent,
  useDeferredValue,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type Mentioned, toEditable, toMarkup } from '@/lib/mentions';
import { cn } from '@/lib/utils';

// "@" at the start or after a space, followed by what was typed of the name, up to the cursor.
const MENTION_IN_PROGRESS = /(?:^|\s)@([\p{L}\p{N}._-]{0,40})$/u;

interface Props {
  label: string;
  submitLabel: string;
  /** Initial text with Mention markup (editing). */
  initial?: string;
  sending: boolean;
  error?: string;
  /** Rejects on error, so the typed text is not lost. */
  onSubmit: (text: string) => Promise<unknown>;
  onCancel?: () => void;
  autoFocus?: boolean;
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
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const [initialState] = useState(() => toEditable(initial));
  const [text, setText] = useState(initialState.text);
  const [mentioned, setMentioned] = useState<Mentioned[]>(initialState.mentioned);
  const [query, setQuery] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const search = useDeferredValue(query);

  const { data } = useMentionableSearch(
    { search: search ?? '' },
    { query: { enabled: search !== null, staleTime: 30_000 } },
  );
  const suggestions = query !== null ? (data?.data ?? []) : [];
  const open = suggestions.length > 0;

  function followCursor(value: string, cursor: number) {
    const mention = MENTION_IN_PROGRESS.exec(value.slice(0, cursor));
    setQuery(mention ? mention[1]! : null);
    setHighlighted(0);
  }

  function pick(person: Mentioned) {
    const cursor = textarea.current?.selectionStart ?? text.length;
    const before = text.slice(0, cursor).replace(/@[\p{L}\p{N}._-]*$/u, `@${person.name} `);
    setText(before + text.slice(cursor));
    setMentioned((current) => [...current.filter((m) => m.id !== person.id), person]);
    setQuery(null);
    pendingCursor.current = before.length;
  }

  // After inserting the Mention, the cursor goes right after it (before the next key).
  useLayoutEffect(() => {
    if (pendingCursor.current === null) return;
    textarea.current?.focus();
    textarea.current?.setSelectionRange(pendingCursor.current, pendingCursor.current);
    pendingCursor.current = null;
  }, [text]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      pick(suggestions[highlighted]!);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setQuery(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    try {
      await onSubmit(toMarkup(text.trim(), mentioned));
      setText('');
      setMentioned([]);
    } catch {
      // The error arrives through the `error` prop; the text stays for another try.
    }
  }

  const listId = `${id}-suggestions`;
  return (
    <form className="grid gap-2" onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Textarea
          id={id}
          ref={textarea}
          rows={3}
          value={text}
          placeholder={label}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${highlighted}` : undefined}
          onChange={(event) => {
            setText(event.target.value);
            followCursor(event.target.value, event.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setQuery(null)}
        />
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
              // mousedown, not click: a click would blur the field and close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(person);
              }}
            >
              {person.name}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{t('comments.mentionHelp')}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!text.trim() || sending}>
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
