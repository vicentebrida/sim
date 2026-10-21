import { type IdeaDtoOutput, useIdeasVersions } from '@sim/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownText } from '@/components/markdown-text';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/dates';

function show(value: unknown, yes: string, no: string) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? yes : no;
  return String(value ?? '');
}

/** The earlier texts of an Idea that its Author edited after publishing it. */
export function IdeaVersions({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useIdeasVersions(idea.number, { query: { enabled: open } });
  if (!idea.editedAt) return null;

  const versions = data?.data ?? [];
  return (
    <section className="space-y-3">
      <Button
        variant="link"
        size="sm"
        className="px-0"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? t('versions.hide') : t('versions.show')}
      </Button>
      {open && (
        <ol className="space-y-4" aria-label={t('versions.title')}>
          {versions.map((version) => (
            <li key={version.version} className="space-y-2 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                {t('versions.version', { number: version.version })} ·{' '}
                {t('versions.period', {
                  from: formatDateTime(version.validFrom),
                  to: formatDateTime(version.replacedAt),
                })}
              </p>
              <h3 className="font-medium">{version.title}</h3>
              <p className="text-sm text-muted-foreground">{version.category.name}</p>
              {version.answers.map((answer) => (
                <div key={answer.fieldId}>
                  <h4 className="text-sm font-semibold text-muted-foreground">{answer.label}</h4>
                  {answer.type === 'long_text' && typeof answer.value === 'string' ? (
                    <MarkdownText text={answer.value} />
                  ) : (
                    <p className="whitespace-pre-wrap">
                      {show(answer.value, t('ideas.yes'), t('ideas.no'))}
                    </p>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
