import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { FIELDS } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, administrator: true };

describe('Custom Fields management', () => {
  it('creates a choice field with the options typed one per line', async () => {
    simulateAuth({ session: admin });
    let created: unknown;
    server.use(
      http.get('*/api/custom-fields', () => HttpResponse.json(FIELDS)),
      http.post('*/api/custom-fields', async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ ...FIELDS[0], ...(created as object) }, { status: 201 });
      }),
    );
    renderApp('/admin/custom-fields');
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Tipo'), 'single_choice');
    await user.type(screen.getByLabelText('Rótulo'), 'Área');
    await user.type(
      screen.getByLabelText('Opções (uma por linha)'),
      'Fábrica{enter} Escritório {enter}{enter}Fábrica',
    );
    await user.click(screen.getByRole('button', { name: 'Criar campo' }));

    await expect
      .poll(() => created)
      .toEqual({
        label: 'Área',
        help: '',
        type: 'single_choice',
        required: false,
        options: ['Fábrica', 'Escritório'],
        useForDetection: false,
      });
  });

  it('explains why a field in use cannot be deleted', async () => {
    simulateAuth({ session: admin });
    server.use(
      http.get('*/api/custom-fields', () => HttpResponse.json(FIELDS)),
      http.delete('*/api/custom-fields/:id', () =>
        HttpResponse.json({ message: 'in use', code: 'FIELD_IN_USE' }, { status: 409 }),
      ),
    );
    renderApp('/admin/custom-fields');
    const user = userEvent.setup();

    const [remove] = await screen.findAllByRole('button', { name: 'Excluir' });
    await user.click(remove!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Desative-o em vez de excluir');
  });
});
