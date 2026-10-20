import type { NotificationPageDtoOutputItemsItem } from '@sim/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { BRUNO, sampleIdea, simulateIdeas } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

function notification(
  partial: Partial<NotificationPageDtoOutputItemsItem>,
): NotificationPageDtoOutputItemsItem {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
    type: 'comment',
    idea: { number: 7, title: 'Relatório mais rápido' },
    actor: BRUNO,
    commentId: null,
    data: {},
    createdAt: '2026-10-05T10:00:00.000Z',
    read: false,
    ...partial,
  };
}

/** Simulated Notifications API with an in-memory list. */
function simulateNotifications(initial: NotificationPageDtoOutputItemsItem[]) {
  let items = initial;
  let preferences: { newComments: boolean; email: 'instant' | 'daily' | 'off' } = {
    newComments: true,
    email: 'instant',
  };
  const unread = () => items.filter((n) => !n.read).length;
  server.use(
    http.get('*/api/notifications/unread-count', () => HttpResponse.json({ unread: unread() })),
    http.get('*/api/notifications', () =>
      HttpResponse.json({ items, total: items.length, unread: unread(), page: 1, pageSize: 20 }),
    ),
    http.post('*/api/notifications/read-all', () => {
      items = items.map((n) => ({ ...n, read: true }));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/api/notifications/:id/read', ({ params }) => {
      items = items.map((n) => (n.id === params.id ? { ...n, read: true } : n));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('*/api/notifications/preferences', () =>
      HttpResponse.json({ ...preferences, emailAvailable: true }),
    ),
    http.put('*/api/notifications/preferences', async ({ request }) => {
      preferences = { ...preferences, ...((await request.json()) as object) };
      return HttpResponse.json({ ...preferences, emailAvailable: true });
    }),
  );
  return { preferences: () => preferences };
}

describe('the bell', () => {
  it('shows unread Notifications and opens the Idea, marking it as read', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    simulateNotifications([
      notification({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        type: 'status',
        data: { from: 'open', to: 'under_review' },
      }),
      notification({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', type: 'mention', read: true }),
    ]);
    const { router } = renderApp('/');
    const user = userEvent.setup();

    const bell = await screen.findByRole('button', { name: 'Notificações (1 não lida)' });
    await user.click(bell);
    const panel = await screen.findByRole('region', { name: 'Notificações' });
    const [statusChange, mention] = within(panel).getAllByRole('link');
    expect(statusChange).toHaveTextContent('Não lida: Bruno Lima mudou a ideia #7 para Em análise');
    expect(mention).toHaveTextContent('Bruno Lima mencionou você na ideia #7');

    await user.click(statusChange!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/ideas/7'));
    expect(await screen.findByRole('button', { name: 'Notificações' })).toBeInTheDocument();
  });

  it('a Comment Notification links to the Comment itself', async () => {
    simulateAuth({ session: ana });
    simulateNotifications([
      notification({ commentId: '99999999-9999-4999-8999-999999999999', type: 'reply' }),
    ]);
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Notificações/ }));
    expect(
      await screen.findByRole('link', { name: /respondeu seu comentário na ideia #7/ }),
    ).toHaveAttribute('href', '/ideas/7#comment-99999999-9999-4999-8999-999999999999');
  });

  it('marks all as read and turns off new Comment notices', async () => {
    simulateAuth({ session: ana });
    const api = simulateNotifications([
      notification({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001' }),
      notification({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', type: 'new_idea' }),
    ]);
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Notificações (2 não lidas)' }));
    await user.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }));
    expect(await screen.findByRole('button', { name: 'Notificações' })).toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: 'Avisar sobre novos comentários nas ideias que sigo' }),
    );
    await waitFor(() => expect(api.preferences().newComments).toBe(false));

    await user.selectOptions(screen.getByLabelText('E-mails de notificações'), 'daily');
    await waitFor(() => expect(api.preferences().email).toBe('daily'));
    await user.selectOptions(screen.getByLabelText('E-mails de notificações'), 'off');
    await waitFor(() => expect(api.preferences().email).toBe('off'));
  });

  it('shows an empty state', async () => {
    simulateAuth({ session: ana });
    simulateNotifications([]);
    renderApp('/');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Notificações' }));
    expect(await screen.findByText('Nenhuma notificação por enquanto.')).toBeInTheDocument();
  });
});

describe('Following', () => {
  it('follows and unfollows an Idea from its page', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({ idea: sampleIdea({ following: false }) });
    renderApp('/ideas/7');
    const user = userEvent.setup();

    const follow = await screen.findByRole('button', { name: 'Seguir' });
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    await user.click(follow);
    const following = await screen.findByRole('button', { name: 'Seguindo' });
    expect(following).toHaveAttribute('aria-pressed', 'true');
    await user.click(following);
    expect(await screen.findByRole('button', { name: 'Seguir' })).toBeInTheDocument();
    expect(received.map((r) => r.method)).toEqual(['PUT', 'DELETE']);
  });

  it('filters the list by the Ideas being followed', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas();
    const { router } = renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('checkbox', { name: 'Que sigo' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ following: true }));
    await waitFor(() =>
      expect(received.some((r) => r.url.searchParams.get('following') === 'true')).toBe(true),
    );
  });
});
