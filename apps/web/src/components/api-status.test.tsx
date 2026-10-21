import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ApiStatus } from './api-status';

describe('ApiStatus', () => {
  it('shows nothing while the server is up', async () => {
    let asked = false;
    server.use(
      http.get('*/api/health', () => {
        asked = true;
        return HttpResponse.json({ status: 'ok', database: 'up' });
      }),
    );
    const { container } = renderWithProviders(<ApiStatus />);
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the server has issues when the database is down', async () => {
    server.use(
      http.get('*/api/health', () => HttpResponse.json({ status: 'degraded', database: 'down' })),
    );
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText('Servidor com problemas')).toBeInTheDocument();
  });

  it('shows the server is unavailable when the API fails', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.json({}, { status: 503 })));
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument();
  });
});
