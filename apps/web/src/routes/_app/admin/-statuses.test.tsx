import type { StatusSettingDtoOutput } from '@sim/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { sampleIdea, simulateIdeas } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };

const STATUSES = [
  'draft',
  'open',
  'under_review',
  'approved',
  'in_progress',
  'done',
  'declined',
  'duplicate',
  'archived',
] as const;

function simulateStatuses(
  custom: Partial<Record<(typeof STATUSES)[number], Partial<StatusSettingDtoOutput>>> = {},
) {
  let settings: StatusSettingDtoOutput[] = STATUSES.map((status) => ({
    status,
    label: null,
    color: null,
    description: '',
    enabled: true,
    optional: status === 'approved' || status === 'in_progress',
    ...custom[status],
  }));
  const updates: unknown[] = [];
  server.use(
    http.get('*/api/statuses', () => HttpResponse.json(settings)),
    http.put('*/api/statuses/:status', async ({ params, request }) => {
      const data = (await request.json()) as object;
      updates.push({ status: params.status, ...data });
      settings = settings.map((s) => (s.status === params.status ? { ...s, ...data } : s));
      return HttpResponse.json(settings.find((s) => s.status === params.status));
    }),
  );
  return { updates };
}

describe('Status appearance', () => {
  it('shows the name, color and hint the Administrator chose', async () => {
    simulateAuth({ session: ana });
    simulateStatuses({
      open: { label: 'Nova', color: '#aa5500', description: 'Acabou de chegar.' },
    });
    simulateIdeas({ idea: sampleIdea({ status: 'open' }) });
    renderApp('/ideas/7');

    const badge = await screen.findByText('Nova');
    expect(badge).toHaveAttribute('title', 'Acabou de chegar.');
    expect(badge).toHaveStyle({ backgroundColor: 'rgb(170, 85, 0)' });
  });

  it('renames a Status and turns off an optional one', async () => {
    simulateAuth({ session: admin });
    const { updates } = simulateStatuses();
    renderApp('/admin/statuses');
    const user = userEvent.setup();

    const approved = (await screen.findByText('Aprovada', { selector: 'span.text-sm' })).closest(
      'li',
    )!;
    await user.click(within(approved).getByRole('button', { name: 'Editar' }));
    await user.type(within(approved).getByLabelText('Nome'), 'Liberada');
    await user.click(within(approved).getByRole('button', { name: 'Salvar' }));
    expect(await within(approved).findByText('Liberada')).toBeInTheDocument();

    await user.click(within(approved).getByRole('button', { name: 'Desligar' }));
    expect(await within(approved).findByText(/desligado/)).toBeInTheDocument();

    expect(updates).toEqual([
      { status: 'approved', label: 'Liberada', color: null, description: '' },
      { status: 'approved', enabled: false },
    ]);
    // Statuses that cannot be turned off have no such button.
    const open = screen.getAllByText('Aberta', { selector: 'span.text-sm' })[0]!.closest('li')!;
    expect(within(open).queryByRole('button', { name: 'Desligar' })).not.toBeInTheDocument();
  });
});
