import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };

describe('Audit log', () => {
  it('lists who did what, including the system', async () => {
    simulateAuth({ session: admin });
    server.use(
      http.get('*/api/audit', () =>
        HttpResponse.json({
          items: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              action: 'collaborator.anonymized',
              targetType: 'collaborator',
              targetId: 'abc',
              details: {},
              actor: { id: admin.id, name: 'Admin' },
              createdAt: '2026-10-19T12:00:00.000Z',
            },
            {
              id: '00000000-0000-4000-8000-000000000002',
              action: 'collaborator.auto_deactivated',
              targetType: 'collaborator',
              targetId: 'def',
              details: {},
              actor: null,
              createdAt: '2026-10-18T12:00:00.000Z',
            },
          ],
          total: 2,
          page: 1,
          pageSize: 30,
        }),
      ),
    );
    renderApp('/admin/audit');

    expect(await screen.findByText('Anonimizou um colaborador')).toBeInTheDocument();
    expect(screen.getByText('Desativou um colaborador por inatividade')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
  });
});
