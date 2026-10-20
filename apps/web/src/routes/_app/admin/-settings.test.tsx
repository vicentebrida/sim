import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };

describe('Settings', () => {
  it('turns hidden authorship on', async () => {
    simulateAuth({ session: admin });
    let enabled = false;
    const updates: unknown[] = [];
    server.use(
      http.get('*/api/settings', () =>
        HttpResponse.json({
          hiddenAuthorshipEnabled: enabled,
          stalled: { openDays: 15, reviewDays: 30, escalationDays: 7 },
        }),
      ),
      http.patch('*/api/settings', async ({ request }) => {
        const data = (await request.json()) as { hiddenAuthorshipEnabled: boolean };
        updates.push(data);
        enabled = data.hiddenAuthorshipEnabled;
        return HttpResponse.json({
          hiddenAuthorshipEnabled: enabled,
          stalled: { openDays: 15, reviewDays: 30, escalationDays: 7 },
        });
      }),
    );
    renderApp('/admin/settings');
    const user = userEvent.setup();

    const box = await screen.findByRole('checkbox', {
      name: 'Permitir que o Autor oculte o nome numa ideia',
    });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/Administradores podem identificar o Autor/)).toBeInTheDocument();
    await user.click(box);
    await waitFor(() => expect(box).toBeChecked());
    expect(updates).toEqual([{ hiddenAuthorshipEnabled: true }]);
  });

  it('shows and saves the Stalled Idea deadlines', async () => {
    simulateAuth({ session: admin });
    const updates: unknown[] = [];
    server.use(
      http.get('*/api/settings', () =>
        HttpResponse.json({
          hiddenAuthorshipEnabled: false,
          stalled: { openDays: 15, reviewDays: 30, escalationDays: 7 },
        }),
      ),
      http.patch('*/api/settings', async ({ request }) => {
        updates.push(await request.json());
        return HttpResponse.json({
          hiddenAuthorshipEnabled: false,
          stalled: { openDays: 10, reviewDays: 30, escalationDays: 7 },
        });
      }),
    );
    renderApp('/admin/settings');
    const user = userEvent.setup();

    const open = await screen.findByLabelText('Aberta (dias)');
    expect(open).toHaveValue('15');
    expect(screen.getByLabelText('Em análise (dias)')).toHaveValue('30');
    await user.clear(open);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled(); // empty is not a deadline
    await user.type(open, '10');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
    expect(updates).toEqual([{ stalled: { openDays: 10, reviewDays: 30, escalationDays: 7 } }]);
  });
});
