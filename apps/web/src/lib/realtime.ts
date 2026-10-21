import { getNotificationsListQueryKey, getNotificationsUnreadCountQueryKey } from '@sim/api-client';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Real time (ADR-0009): the API says, through Server-Sent Events, which Idea or bell changed, and
 * the page fetches it again. While the stream is down the bell goes back to polling.
 */
let connected = false;
const subscribers = new Set<() => void>();

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  for (const notify of subscribers) notify();
}

/** Whether the real-time stream is open (the bell then stops polling). */
export function useRealtimeConnected() {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => connected,
  );
}

function refreshIdea(queryClient: QueryClient, number: number) {
  const path = `/api/ideas/${number}`;
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      (queryKey[0] === path || queryKey[0].startsWith(`${path}/`)),
  });
}

function refreshBell(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: getNotificationsUnreadCountQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getNotificationsListQueryKey() }),
  ]);
}

/** Opens the stream while the signed-in pages are shown. */
export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events', { withCredentials: true });
    let openedBefore = false;

    source.addEventListener('open', () => {
      setConnected(true);
      // Back after a drop: anything may have changed meanwhile.
      if (openedBefore) void queryClient.invalidateQueries();
      openedBefore = true;
    });
    // The browser retries by itself; until then (or for good, after a 401) the bell polls.
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('idea', (event) => {
      const { number } = JSON.parse((event as MessageEvent<string>).data) as { number: number };
      void refreshIdea(queryClient, number);
    });
    source.addEventListener('notifications', () => void refreshBell(queryClient));
    source.addEventListener('resync', () => void queryClient.invalidateQueries());

    return () => {
      source.close();
      setConnected(false);
    };
  }, [queryClient]);
}
