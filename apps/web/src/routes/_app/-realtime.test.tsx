import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { sampleIdea, simulateIdeas } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

/** Stands in for the browser's EventSource, so the test can send events. */
class FakeEventSource extends EventTarget {
  static last: FakeEventSource | undefined;
  closed = false;
  constructor(readonly url: string) {
    super();
    FakeEventSource.last = this;
  }
  emit(type: string, data: object = {}) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  close() {
    this.closed = true;
  }
}

const source = async () => {
  await vi.waitFor(() => expect(FakeEventSource.last).toBeDefined());
  return FakeEventSource.last!;
};

describe('Real time', () => {
  beforeEach(() => {
    FakeEventSource.last = undefined;
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the Idea again when someone changes it', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    renderApp('/ideas/7');
    expect(
      await screen.findByRole('heading', { name: 'Relatório mais rápido' }),
    ).toBeInTheDocument();
    const events = await source();
    expect(events.url).toBe('/api/events');

    server.use(
      http.get('*/api/ideas/7', () =>
        HttpResponse.json(sampleIdea({ title: 'Relatório em 5 minutos' })),
      ),
    );
    // Another Idea changing does not touch this one.
    events.emit('idea', { number: 70 });
    events.emit('idea', { number: 7 });
    expect(
      await screen.findByRole('heading', { name: 'Relatório em 5 minutos' }),
    ).toBeInTheDocument();
  });

  it('updates the bell when a Notification arrives', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    renderApp('/');
    expect(await screen.findByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    const events = await source();
    events.emit('open');

    server.use(
      http.get('*/api/notifications/unread-count', () => HttpResponse.json({ unread: 3 })),
    );
    events.emit('notifications');
    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});
