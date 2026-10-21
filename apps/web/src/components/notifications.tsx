import {
  getNotificationsListQueryKey,
  getNotificationsPreferencesQueryKey,
  getNotificationsUnreadCountQueryKey,
  type NotificationPageDtoOutputItemsItem,
  useNotificationsList,
  useNotificationsMarkAllRead,
  useNotificationsMarkRead,
  useNotificationsPreferences,
  useNotificationsSetPreferences,
  useNotificationsUnreadCount,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, formatDateTime } from '@/lib/dates';
import { useRealtimeConnected } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useStatusInfo } from '@/lib/use-statuses';

// The bell polls the unread count only while the real-time stream is down (ADR-0009).
const POLL_INTERVAL_MS = 30_000;

type Notification = NotificationPageDtoOutputItemsItem;

function useRefreshNotifications() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getNotificationsUnreadCountQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getNotificationsListQueryKey() }),
    ]);
}

function describeNotification(
  notification: Notification,
  t: TFunction,
  statusLabel: (status: string) => string,
) {
  const data = notification.data as {
    to?: string;
    status?: string;
    original?: { number: number; title: string };
    archiveOn?: string;
    stage?: string;
  };
  return t(`notifications.types.${notification.type}`, {
    actor: notification.actor?.name ?? 'SIM',
    number: notification.idea.number,
    to: data.to ? statusLabel(data.to) : '',
    status: data.status ? statusLabel(data.status) : '',
    original: data.original?.number,
    date: data.archiveOn ? formatDate(data.archiveOn) : '',
    stage: data.stage ?? '',
  });
}

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const realtime = useRealtimeConnected();
  const { data } = useNotificationsUnreadCount({
    query: { refetchInterval: realtime ? false : POLL_INTERVAL_MS },
  });
  const unread = data?.data.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t('notifications.bell', { count: unread })}
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        {open && <NotificationPanel onNavigate={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function NotificationPanel({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const statusInfo = useStatusInfo();
  const refresh = useRefreshNotifications();
  const { data } = useNotificationsList({ pageSize: 20 });
  const markRead = useNotificationsMarkRead({ mutation: { onSuccess: refresh } });
  const markAllRead = useNotificationsMarkAllRead({ mutation: { onSuccess: refresh } });
  const page = data?.data;

  return (
    <section aria-labelledby="notifications-title">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 id="notifications-title" className="text-sm font-semibold">
          {t('notifications.title')}
        </h2>
        {Boolean(page?.unread) && (
          <Button
            variant="link"
            size="sm"
            className="px-0"
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {t('notifications.markAllRead')}
          </Button>
        )}
      </header>
      {page && page.items.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t('notifications.empty')}
        </p>
      )}
      <ul className="max-h-96 overflow-y-auto">
        {page?.items.map((notification) => (
          <li key={notification.id}>
            <Link
              to="/ideas/$number"
              params={{ number: String(notification.idea.number) }}
              hash={notification.commentId ? `comment-${notification.commentId}` : undefined}
              className={cn(
                'block border-b px-4 py-3 text-sm hover:bg-muted/50',
                !notification.read && 'bg-muted/40',
              )}
              onClick={() => {
                if (!notification.read) markRead.mutate({ id: notification.id });
                onNavigate();
              }}
            >
              <p className={cn(!notification.read && 'font-medium')}>
                {!notification.read && (
                  <span className="sr-only">{t('notifications.unread')}: </span>
                )}
                {describeNotification(notification, t, statusInfo.label)}
              </p>
              <p className="truncate text-muted-foreground">{notification.idea.title}</p>
              <time className="text-xs text-muted-foreground" dateTime={notification.createdAt}>
                {formatDateTime(notification.createdAt)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
      <Preferences />
    </section>
  );
}

function Preferences() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useNotificationsPreferences();
  const setPreferences = useNotificationsSetPreferences({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getNotificationsPreferencesQueryKey() }),
    },
  });
  if (!data) return null;
  const preferences = data.data;
  return (
    <div className="space-y-2 px-4 py-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          checked={preferences.newComments}
          disabled={setPreferences.isPending}
          onChange={(event) =>
            setPreferences.mutate({ data: { newComments: event.target.checked } })
          }
        />
        {t('notifications.newCommentsPreference')}
      </label>
      {preferences.emailAvailable && (
        <div className="grid gap-1">
          <Label htmlFor="email-mode">{t('notifications.emailPreference')}</Label>
          <NativeSelect
            id="email-mode"
            value={preferences.email}
            disabled={setPreferences.isPending}
            onChange={(event) =>
              setPreferences.mutate({
                data: { email: event.target.value as typeof preferences.email },
              })
            }
          >
            {(['instant', 'daily', 'off'] as const).map((mode) => (
              <option key={mode} value={mode}>
                {t(`notifications.emailModes.${mode}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}
