import {
  getStatusesListQueryKey,
  type StatusSettingDtoOutput,
  useStatusesList,
  useStatusesUpdate,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/admin/statuses')({ component: StatusesPage });

function StatusesPage() {
  const { t } = useTranslation();
  const { data } = useStatusesList();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('statuses.title')}</h1>
        <p className="text-muted-foreground">{t('statuses.subtitle')}</p>
      </div>
      <ul className="space-y-3">
        {(data?.data ?? []).map((setting) => (
          <li key={setting.status}>
            <StatusItem setting={setting} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEFAULT_COLOR = '#6b7280';

function StatusItem({ setting }: { setting: StatusSettingDtoOutput }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(setting.label ?? '');
  const [color, setColor] = useState<string | null>(setting.color);
  const [description, setDescription] = useState(setting.description);
  const update = useStatusesUpdate({
    mutation: {
      onSuccess: async () => {
        setEditing(false);
        await queryClient.invalidateQueries({ queryKey: getStatusesListQueryKey() });
      },
    },
  });
  const failure = apiErrorMessage(update.error, t);

  function save(event: FormEvent) {
    event.preventDefault();
    update.mutate({
      status: setting.status,
      data: { label: label.trim() || null, color, description },
    });
  }

  return (
    <Card className={setting.enabled ? undefined : 'opacity-70'}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={setting.status} />
            <span className="text-sm text-muted-foreground">{t(`status.${setting.status}`)}</span>
            {!setting.enabled && (
              <span className="text-sm text-muted-foreground">· {t('statuses.off')}</span>
            )}
          </div>
          {!editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t('statuses.edit')}
              </Button>
              {setting.optional && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ status: setting.status, data: { enabled: !setting.enabled } })
                  }
                >
                  {setting.enabled ? t('statuses.turnOff') : t('statuses.turnOn')}
                </Button>
              )}
            </div>
          )}
        </div>
        {!editing && setting.description && (
          <p className="text-sm text-muted-foreground">{setting.description}</p>
        )}
        {editing && (
          <form className="grid gap-4" onSubmit={save}>
            <FormField
              id={`${setting.status}-label`}
              label={t('statuses.label')}
              value={label}
              maxLength={40}
              placeholder={t(`status.${setting.status}`)}
              onChange={(event) => setLabel(event.target.value)}
            />
            <div className="grid gap-2">
              <Label htmlFor={`${setting.status}-color`}>{t('statuses.color')}</Label>
              <div className="flex items-center gap-3">
                <input
                  id={`${setting.status}-color`}
                  type="color"
                  className="h-9 w-14 cursor-pointer rounded border"
                  value={color ?? DEFAULT_COLOR}
                  onChange={(event) => setColor(event.target.value)}
                />
                {color && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setColor(null)}>
                    {t('statuses.defaultColor')}
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${setting.status}-description`}>{t('statuses.description')}</Label>
              <Textarea
                id={`${setting.status}-description`}
                rows={2}
                maxLength={280}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">{t('statuses.descriptionHelp')}</p>
            </div>
            {failure && (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={update.isPending}>
                {t('statuses.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t('statuses.cancel')}
              </Button>
            </div>
          </form>
        )}
        {!editing && failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
