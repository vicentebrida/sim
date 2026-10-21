import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { MENTION, withoutHtml } from '@/lib/markdown';
import { cn } from '@/lib/utils';

// What the editor can write. Anything else (tables, images) shows only its text.
const ALLOWED = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
];

const MENTION_LINK = 'mention:';

const components: Components = {
  a: ({ href = '', children }) =>
    href.startsWith(MENTION_LINK) ? (
      <span className="font-medium text-primary">{children}</span>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ),
};

// Only http(s) and mailto links (react-markdown's default), plus the Mentions.
const urlTransform = (url: string) =>
  url.startsWith(MENTION_LINK) ? url : defaultUrlTransform(url);

/** A long text (Markdown), formatted. HTML in it is shown as text, never run. */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const source = withoutHtml(text).replace(MENTION, `[@$1](${MENTION_LINK}$2)`);
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={components}
        urlTransform={urlTransform}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
