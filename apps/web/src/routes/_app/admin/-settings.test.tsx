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
      http.get('*/api/settings', () => HttpResponse.json({ hiddenAuthorshipEnabled: enabled })),
      http.patch('*/api/settings', async ({ request }) => {
        const data = (await request.json()) as { hiddenAuthorshipEnabled: boolean };
        updates.push(data);
        enabled = data.hiddenAuthorshipEnabled;
        return HttpResponse.json({ hiddenAuthorshipEnabled: enabled });
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
});
