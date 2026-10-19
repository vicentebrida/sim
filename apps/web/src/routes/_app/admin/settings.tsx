import { getSettingsGetQueryKey, useSettingsGet, useSettingsUpdate } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
    </div>
  );
}
