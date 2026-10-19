import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ApiStatus } from './api-status';

describe('ApiStatus', () => {
  it('mostra que o servidor está no ar quando a API responde ok', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok', database: 'up' })));
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText('Servidor no ar')).toBeInTheDocument();
  });

  it('mostra servidor indisponível quando a API falha', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.json({}, { status: 503 })));
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument();
  });
});
