import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { FIELDS, simulateIdeas, TI } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const RH = {
  ...TI,
  id: '12121212-1212-4212-8212-121212121212',
  name: 'RH',
  description: 'Pessoas',
};
const SECURITY = {
  ...FIELDS[0]!,
  id: '77777777-7777-4777-8777-777777777777',
  label: 'Sistema afetado',
  required: false,
  useForDetection: false,
  categoryIds: [TI.id],
};

describe('Custom Fields per Category', () => {
  it('shows a scoped field only in its Category, and does not send the others', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas();
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([TI, RH])),
      http.get('*/api/custom-fields', () => HttpResponse.json([...FIELDS, SECURITY])),
    );
    renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Ideia');
    expect(screen.queryByLabelText('Sistema afetado')).not.toBeInTheDocument(); // no Category yet

    await user.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    await user.type(await screen.findByLabelText('Sistema afetado'), 'ERP');

    await user.selectOptions(screen.getByLabelText('Categoria'), RH.id);
    expect(screen.queryByLabelText('Sistema afetado')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() =>
      expect(received.find((r) => r.method === 'POST')?.body).toMatchObject({
        categoryId: RH.id,
        values: {},
      }),
    );
  });
});
