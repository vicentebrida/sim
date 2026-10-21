import { type Editor, EditorContent, useEditorState } from '@tiptap/react';
import { Bold, Italic, Link2, List, ListOrdered, type LucideIcon, Quote } from 'lucide-react';
import { Popover } from 'radix-ui';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LINK, useMarkdownEditor } from '@/lib/use-markdown-editor';
import { cn } from '@/lib/utils';

/** The editable area with its toolbar, in a box that looks like the other fields. */
export function EditorFrame({
  editor,
  invalid,
  className,
}: {
  editor: Editor;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <div
      data-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-invalid:border-destructive data-invalid:ring-destructive/20 dark:bg-input/30',
        className,
      )}
    >
      <MarkdownToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

type Action = 'bold' | 'italic' | 'bulletList' | 'orderedList' | 'quote';
const ACTIONS: { action: Action; icon: LucideIcon; run: (editor: Editor) => void }[] = [
  { action: 'bold', icon: Bold, run: (e) => e.chain().focus().toggleBold().run() },
  { action: 'italic', icon: Italic, run: (e) => e.chain().focus().toggleItalic().run() },
  { action: 'bulletList', icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  {
    action: 'orderedList',
    icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  { action: 'quote', icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run() },
];

function MarkdownToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
      link: editor.isActive('link'),
    }),
  });

  return (
    <div
      role="toolbar"
      aria-label={t('editor.toolbar')}
      className="flex flex-wrap gap-0.5 border-b border-input p-1"
      // A click keeps the focus (and the cursor) in the text, so typing goes on right away.
      onMouseDown={(event) => event.preventDefault()}
    >
      {ACTIONS.map(({ action, icon: Icon, run }) => (
        <Button
          key={action}
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label={t(`editor.${action}`)}
          title={t(`editor.${action}`)}
          aria-pressed={active[action]}
          onClick={() => run(editor)}
        >
          <Icon />
        </Button>
      ))}
      <LinkButton editor={editor} active={active.link} />
    </div>
  );
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [invalid, setInvalid] = useState(false);

  function openWith(next: boolean) {
    if (next) {
      setUrl((editor.getAttributes('link').href as string | undefined) ?? '');
      setInvalid(false);
    }
    setOpen(next);
  }

  function apply(event: FormEvent) {
    // The editor may sit inside another form (the Idea or the Comment).
    event.preventDefault();
    event.stopPropagation();
    const href = /^[\w-]+(\.[\w-]+)+/.test(url.trim()) ? `https://${url.trim()}` : url.trim();
    if (!LINK.test(href)) {
      setInvalid(true);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !active) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] });
    } else {
      chain.setLink({ href });
    }
    chain.run();
    setOpen(false);
  }

  function remove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={openWith}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label={t('editor.link')}
          title={t('editor.link')}
          aria-pressed={active}
        >
          <Link2 />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
        >
          {/* Not a <form>: a form inside the Idea or Comment form is invalid HTML. */}
          <div
            className="grid gap-2"
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply(event);
            }}
          >
            <label htmlFor={id} className="text-sm font-medium">
              {t('editor.linkUrl')}
            </label>
            <Input
              id={id}
              value={url}
              placeholder="https://"
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-error` : undefined}
              onChange={(event) => setUrl(event.target.value)}
            />
            {invalid && (
              <p id={`${id}-error`} className="text-sm text-destructive">
                {t('editor.linkInvalid')}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={apply}>
                {t('editor.linkApply')}
              </Button>
              {active && (
                <Button type="button" size="sm" variant="ghost" onClick={remove}>
                  {t('editor.linkRemove')}
                </Button>
              )}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A Long Text field: the editor with its toolbar, named by the label with `labelId`. */
export function MarkdownEditor({
  id,
  labelId,
  initial,
  onChange,
  onBlur,
  invalid,
  describedBy,
}: {
  id: string;
  labelId: string;
  initial: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const editor = useMarkdownEditor({
    initial,
    onChange,
    onBlur,
    attributes: {
      id,
      role: 'textbox',
      'aria-labelledby': labelId,
      'aria-invalid': String(Boolean(invalid)),
      ...(describedBy && { 'aria-describedby': describedBy }),
    },
  });
  return <EditorFrame editor={editor} invalid={invalid} />;
}
