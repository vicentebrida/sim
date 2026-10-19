import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simularAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = {
  ...ana,
  id: '0b5e7c1a-2f3d-4e6a-8b9c-1d2e3f4a5b6c',
  nome: 'Admin',
  administrador: true,
};

function simularColaboradores() {
  const lista = [{ ...admin, ativo: true }];
  server.use(
    http.get('*/api/colaboradores', () => HttpResponse.json(lista)),
    http.post('*/api/colaboradores', async ({ request }) => {
      const dados = (await request.json()) as {
        nome: string;
        email: string;
        administrador: boolean;
      };
      if (lista.some((c) => c.email === dados.email)) {
        return HttpResponse.json({ message: 'duplicado' }, { status: 409 });
      }
      const colaborador = {
        ...ana,
        id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
        nome: dados.nome,
        email: dados.email,
        administrador: dados.administrador,
        ativo: true,
      };
      lista.push(colaborador);
      return HttpResponse.json({ colaborador, senhaTemporaria: 'Tmp-xyz-123' }, { status: 201 });
    }),
  );
}

describe('gestão de Colaboradores', () => {
  it('Administrador cria uma conta local e vê a senha temporária uma vez', async () => {
    simularAuth({ sessao: admin });
    simularColaboradores();
    renderApp('/admin/colaboradores');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Nome'), 'Bruno Lima');
    await usuario.type(screen.getByLabelText('E-mail'), 'bruno@empresa.test');
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Conta criada para Bruno Lima')).toBeInTheDocument();
    expect(screen.getByText('Tmp-xyz-123')).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    expect(await within(tabela).findByText('bruno@empresa.test')).toBeInTheDocument();
  });

  it('avisa quando o e-mail já está em uso', async () => {
    simularAuth({ sessao: admin });
    simularColaboradores();
    renderApp('/admin/colaboradores');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Nome'), 'Outra Ana');
    await usuario.type(screen.getByLabelText('E-mail'), admin.email);
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um Colaborador com este e-mail.',
    );
  });
});
