import { screen, waitFor, within } from '@testing-library/react';
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
          autoArchive: { days: null },
        }),
      ),
      http.patch('*/api/settings', async ({ request }) => {
        const data = (await request.json()) as { hiddenAuthorshipEnabled: boolean };
        updates.push(data);
        enabled = data.hiddenAuthorshipEnabled;
        return HttpResponse.json({
          hiddenAuthorshipEnabled: enabled,
          stalled: { openDays: 15, reviewDays: 30, escalationDays: 7 },
          autoArchive: { days: null },
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
          autoArchive: { days: null },
        }),
      ),
      http.patch('*/api/settings', async ({ request }) => {
        updates.push(await request.json());
        return HttpResponse.json({
          hiddenAuthorshipEnabled: false,
          stalled: { openDays: 10, reviewDays: 30, escalationDays: 7 },
          autoArchive: { days: null },
        });
      }),
    );
    renderApp('/admin/settings');
    const user = userEvent.setup();

    const open = await screen.findByLabelText('Aberta (dias)');
    const form = within(open.closest('form')!);
    expect(open).toHaveValue('15');
    expect(screen.getByLabelText('Em análise (dias)')).toHaveValue('30');
    await user.clear(open);
    expect(form.getByRole('button', { name: 'Salvar' })).toBeDisabled(); // empty is not a deadline
    await user.type(open, '10');
    await user.click(form.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
    expect(updates).toEqual([{ stalled: { openDays: 10, reviewDays: 30, escalationDays: 7 } }]);
  });

  it('turns automatic archiving on with the days, and off again', async () => {
    simulateAuth({ session: admin });
    const updates: unknown[] = [];
    let days: number | null = null;
    const settings = () => ({
      hiddenAuthorshipEnabled: false,
      stalled: { openDays: 15, reviewDays: 30, escalationDays: 7 },
      autoArchive: { days },
    });
    server.use(
      http.get('*/api/settings', () => HttpResponse.json(settings())),
      http.patch('*/api/settings', async ({ request }) => {
        const data = (await request.json()) as { autoArchive: { days: number | null } };
        updates.push(data);
        days = data.autoArchive.days;
        return HttpResponse.json(settings());
      }),
    );
    renderApp('/admin/settings');
    const user = userEvent.setup();

    const box = await screen.findByRole('checkbox', {
      name: 'Arquivar automaticamente Ideias Abertas sem apoio',
    });
    const form = within(box.closest('form')!);
    expect(box).not.toBeChecked();
    expect(screen.queryByLabelText('Dias sem atividade')).not.toBeInTheDocument();
    await user.click(box);
    const field = screen.getByLabelText('Dias sem atividade');
    expect(field).toHaveValue('90');
    await user.clear(field);
    await user.type(field, '10');
    expect(form.getByRole('button', { name: 'Salvar' })).toBeDisabled(); // below the minimum
    await user.clear(field);
    await user.type(field, '60');
    await user.click(form.getByRole('button', { name: 'Salvar' }));
    expect(await form.findByText('Configurações salvas.')).toBeInTheDocument();

    await user.click(box);
    await user.click(form.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates).toEqual([{ autoArchive: { days: 60 } }, { autoArchive: { days: null } }]);
  });
});
