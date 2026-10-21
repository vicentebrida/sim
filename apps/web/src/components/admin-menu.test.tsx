import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';

describe('Administration menu', () => {
  it('lists every Administrator page and opens it', async () => {
    simulateAuth({ session: { ...ana, name: 'Admin', administrator: true } });
    const { router } = renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Administração' }));
    const pages = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(pages).toEqual([
      'Painel',
      'Categorias',
      'Campos',
      'Etiquetas',
      'Status',
      'Identidade',
      'Colaboradores',
      'Integrações',
      'Configurações',
      'Auditoria',
    ]);

    await user.click(screen.getByRole('menuitem', { name: 'Etiquetas' }));
    expect(router.state.location.pathname).toBe('/admin/tags');
  });

  it('is not there for a Collaborator', async () => {
    simulateAuth({ session: ana });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Ideias' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Administração' })).not.toBeInTheDocument();
  });
});
