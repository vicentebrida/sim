import { ApiError, useRecognitionProfile } from '@sim/api-client';
import { createFileRoute, Link } from '@tanstack/react-router';
import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/dates';
import { useStatusInfo } from '@/lib/use-statuses';

export const Route = createFileRoute('/_app/people/$id')({ component: ProfilePage });

/** A person's public profile: the Ideas they saw carried out, never how many they sent. */
function ProfilePage() {
  const { t } = useTranslation();
  const statusInfo = useStatusInfo();
  const { id } = Route.useParams();
  const { data, error } = useRecognitionProfile(id, { query: { retry: false } });
  const profile = data?.data;

  if (error instanceof ApiError && error.status === 404) {
    return <p className="text-center text-muted-foreground">{t('recognition.notFound')}</p>;
  }
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{profile.name}</h1>
        <p className="text-muted-foreground">
          {[profile.department, !profile.active && t('recognition.inactive')]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <section aria-labelledby="completed" className="space-y-3">
        <h2 id="completed" className="text-lg font-semibold">
          {t('recognition.completed', { status: statusInfo.label('done') })}
        </h2>
        {profile.completed.length === 0 ? (
          <p className="text-muted-foreground">{t('recognition.none')}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t('recognition.summary', {
                count: profile.completed.length,
                likes: profile.likesOnCompleted,
              })}
            </p>
            <ul className="divide-y rounded-xl border bg-card">
              {profile.completed.map((idea) => (
                <li key={idea.number} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <Link
                    to="/ideas/$number"
                    params={{ number: String(idea.number) }}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    #{idea.number} {idea.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {idea.category.name} · {formatDate(idea.completedAt)} ·{' '}
                    {t('recognition.likes', { count: idea.likes })}
                  </span>
                  {idea.hiddenAuthorship && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <EyeOff className="size-3" aria-hidden />
                      {t('recognition.onlyYou')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
