import { useRecognitionRecentlyCompleted } from '@sim/api-client';
import { Link } from '@tanstack/react-router';
import { PartyPopper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/dates';
import { useStatusInfo } from '@/lib/use-statuses';

/** Name of a person, linked to their profile unless the Author chose to stay hidden. */
export function PersonLink({
  person,
  hidden,
}: {
  person: { id: string; name: string };
  hidden: boolean;
}) {
  if (hidden) return <>{person.name}</>;
  return (
    <Link
      to="/people/$id"
      params={{ id: person.id }}
      className="underline-offset-2 hover:underline"
    >
      {person.name}
    </Link>
  );
}

/** The latest Ideas Done, on the home page: credit to who proposed them. */
export function RecentlyCompleted() {
  const { t } = useTranslation();
  const statusInfo = useStatusInfo();
  const { data } = useRecognitionRecentlyCompleted({ query: { staleTime: 60_000 } });
  const ideas = data?.data ?? [];
  if (!ideas.length) return null;

  return (
    <section
      aria-labelledby="recently-completed"
      className="rounded-xl border bg-emerald-50/60 p-4 dark:bg-emerald-950/30"
    >
      <h2 id="recently-completed" className="flex items-center gap-2 font-medium">
        <PartyPopper className="size-4" aria-hidden />
        {t('recognition.recent', { status: statusInfo.label('done') })}
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {ideas.map((idea) => (
          <li key={idea.number}>
            <Link
              to="/ideas/$number"
              params={{ number: String(idea.number) }}
              className="font-medium underline-offset-2 hover:underline"
            >
              #{idea.number} {idea.title}
            </Link>{' '}
            <span className="text-muted-foreground">
              · {t('recognition.by')}{' '}
              <PersonLink person={idea.author} hidden={idea.hiddenAuthorship} /> ·{' '}
              {formatDate(idea.completedAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
