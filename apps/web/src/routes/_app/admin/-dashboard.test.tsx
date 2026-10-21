import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };

const dashboard = (averageHours: number | null) => ({
  byStatus: [
    { status: 'open', total: 3 },
    { status: 'approved', total: 1 },
  ],
  byCategory: [{ id: '00000000-0000-4000-8000-000000000001', name: 'TI', total: 4, undecided: 3 }],
  firstDecision: { decided: averageHours === null ? 0 : 2, averageHours },
  stalled: [{ number: 4, title: 'Esquecida', status: 'open', category: 'TI', days: 20 }],
  mostLikedUndecided: [
    { number: 7, title: 'Muito curtida', status: 'open', category: 'TI', likes: 5 },
  ],
});

describe('Dashboard', () => {
  it('shows the numbers, the Stalled and the most liked Ideas, and a CSV link', async () => {
    simulateAuth({ session: admin });
    server.use(http.get('*/api/dashboard', () => HttpResponse.json(dashboard(72))));
    renderApp('/admin/dashboard');

    expect(await screen.findByText('3 dias')).toBeInTheDocument();
    expect(screen.getByText('2 ideias decididas', { exact: false })).toBeInTheDocument();

    expect(screen.getByText('20 dias parada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#4 Esquecida' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#7 Muito curtida' })).toBeInTheDocument();
    expect(screen.getByText('5 curtidas')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute(
      'href',
      '/api/dashboard/export',
    );
  });

  it('says so when nothing was decided yet', async () => {
    simulateAuth({ session: admin });
    server.use(http.get('*/api/dashboard', () => HttpResponse.json(dashboard(null))));
    renderApp('/admin/dashboard');
    expect(await screen.findByText('Ainda sem decisões')).toBeInTheDocument();
  });
});
