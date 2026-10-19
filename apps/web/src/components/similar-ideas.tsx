import { useIdeasSimilar } from '@sim/api-client';
import { keepPreviousData } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LikeCount } from '@/components/likes';
import { StatusBadge } from '@/components/status-badge';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const MIN_TITLE_LENGTH = 3;
const DEBOUNCE_MS = 400;

/**
 * Warns about existing Ideas on the same subject while the Collaborator writes, without blocking
 * the publication (PRD §3.4). Links open in a new tab so the text being written is not lost.
 */
export function SimilarIdeas({
  title,
  text,
  exclude,
}: {
  title: string;
  text: string;
  exclude?: number;
}) {
  const { t } = useTranslation();
  const search = useDebouncedValue({ title: title.trim(), text: text.trim() }, DEBOUNCE_MS);
  const enabled = search.title.length >= MIN_TITLE_LENGTH;
  const { data } = useIdeasSimilar(
    { title: search.title, text: search.text, exclude },
    { query: { enabled, placeholderData: keepPreviousData, staleTime: 30_000 } },
  );
  const ideas = enabled ? (data?.data ?? []) : [];

  return (
    <div aria-live="polite">
      {ideas.length > 0 && (
        <section
          aria-labelledby="similar-ideas"
          className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40"
        >
          <div className="space-y-1">
            <h2 id="similar-ideas" className="flex items-center gap-2 font-medium">
              <Lightbulb className="size-4" aria-hidden />
              {t('similar.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('similar.help')}</p>
          </div>
          <ul className="space-y-2">
            {ideas.map((idea) => (
              <li key={idea.number} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    to="/ideas/$number"
                    params={{ number: String(idea.number) }}
                    target="_blank"
                    rel="noopener"
                    className="font-medium underline"
                  >
                    #{idea.number} {idea.title}
                    <span className="sr-only"> ({t('similar.newTab')})</span>
                  </Link>
                  <StatusBadge status={idea.status} />
                  <span className="text-muted-foreground">{idea.category.name}</span>
                  <LikeCount total={idea.likes} liked={false} />
                </div>
                {idea.status === 'archived' && (
                  <p className="text-sm text-muted-foreground">{t('similar.archivedHint')}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
