import {
  getSettingsGetQueryKey,
  type SettingsDtoOutput,
  useSettingsGet,
  useSettingsUpdate,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/admin/settings')({ component: SettingsPage });

function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useSettingsGet();
  const update = useSettingsUpdate({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getSettingsGetQueryKey() }),
    },
  });
  const settings = data?.data;
  const failure = apiErrorMessage(update.error, t);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('settings.hiddenAuthorship')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4"
                checked={settings.hiddenAuthorshipEnabled}
                disabled={update.isPending}
                onChange={(event) =>
                  update.mutate({ data: { hiddenAuthorshipEnabled: event.target.checked } })
                }
              />
              {t('settings.hiddenAuthorshipEnable')}
            </label>
            <p className="text-sm text-muted-foreground">{t('settings.hiddenAuthorshipHelp')}</p>
            {failure && (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {settings && <StalledDeadlines stalled={settings.stalled} />}
      {settings && <AutoArchive days={settings.autoArchive.days} />}
    </div>
  );
}

const FIELDS = ['openDays', 'reviewDays', 'escalationDays'] as const;

/** Days without Reviewer action before an Idea counts as stalled, and before it escalates. */
function StalledDeadlines({ stalled }: { stalled: SettingsDtoOutput['stalled'] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(() =>
    Object.fromEntries(FIELDS.map((field) => [field, String(stalled[field])])),
  );
  const [saved, setSaved] = useState(false);
  const update = useSettingsUpdate({
    mutation: {
      onSuccess: async () => {
        setSaved(true);
        await queryClient.invalidateQueries({ queryKey: getSettingsGetQueryKey() });
      },
    },
  });
  const valid = FIELDS.every((field) => /^\d{1,3}$/.test(days[field]!) && Number(days[field]) >= 1);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    update.mutate({
      data: {
        stalled: Object.fromEntries(FIELDS.map((field) => [field, Number(days[field])])),
      },
    });
  }

  const failure = apiErrorMessage(update.error, t);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('settings.stalled')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <p className="text-sm text-muted-foreground">{t('settings.stalledHelp')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {FIELDS.map((field) => (
              <FormField
                key={field}
                id={`stalled-${field}`}
                label={t(`settings.stalledFields.${field}`)}
                inputMode="numeric"
                value={days[field]}
                onChange={(event) =>
                  setDays((current) => ({ ...current, [field]: event.target.value }))
                }
              />
            ))}
          </div>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          {saved && !failure && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('settings.saved')}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!valid || update.isPending}
          >
            {t('settings.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const MIN_AUTO_ARCHIVE_DAYS = 14;

/** Archiving Open Ideas nobody supported for a while (off unless chosen here). */
function AutoArchive({ days: current }: { days: number | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(current !== null);
  const [days, setDays] = useState(String(current ?? 90));
  const [saved, setSaved] = useState(false);
  const update = useSettingsUpdate({
    mutation: {
      onSuccess: async () => {
        setSaved(true);
        await queryClient.invalidateQueries({ queryKey: getSettingsGetQueryKey() });
      },
    },
  });
  const valid =
    !enabled ||
    (/^\d{1,3}$/.test(days) && Number(days) >= MIN_AUTO_ARCHIVE_DAYS && Number(days) <= 730);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    update.mutate({ data: { autoArchive: { days: enabled ? Number(days) : null } } });
  }

  const failure = apiErrorMessage(update.error, t);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('settings.autoArchive')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <p className="text-sm text-muted-foreground">{t('settings.autoArchiveHelp')}</p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            {t('settings.autoArchiveEnable')}
          </label>
          {enabled && (
            <div className="grid max-w-48 gap-1">
              <FormField
                id="auto-archive-days"
                label={t('settings.autoArchiveDays')}
                inputMode="numeric"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.autoArchiveMinimum', { min: MIN_AUTO_ARCHIVE_DAYS })}
              </p>
            </div>
          )}
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          {saved && !failure && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('settings.saved')}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!valid || update.isPending}
          >
            {t('settings.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
