import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = {
  ...ana,
  id: '0b5e7c1a-2f3d-4e6a-8b9c-1d2e3f4a5b6c',
  name: 'Admin',
  administrator: true,
};

function simulateCollaborators() {
  const list = [
    { ...admin, active: true, anonymized: false },
    {
      ...ana,
      id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
      name: 'Carla Dias',
      email: 'carla@company.test',
      administrator: false,
      active: true,
      anonymized: false,
    },
  ];
  const calls: string[] = [];
  server.use(
    http.get('*/api/collaborators', () => HttpResponse.json(list)),
    http.post('*/api/collaborators', async ({ request }) => {
      const data = (await request.json()) as {
        name: string;
        email: string;
        administrator: boolean;
      };
      if (list.some((c) => c.email === data.email)) {
        return HttpResponse.json({ message: 'taken', code: 'EMAIL_TAKEN' }, { status: 409 });
      }
      const collaborator = {
        ...ana,
        id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
        name: data.name,
        email: data.email,
        administrator: data.administrator,
        active: true,
        anonymized: false,
      };
      list.push(collaborator);
      return HttpResponse.json({ collaborator, temporaryPassword: 'Tmp-xyz-123' }, { status: 201 });
    }),
    http.patch('*/api/collaborators/:id', async ({ params, request }) => {
      const { active } = (await request.json()) as { active: boolean };
      const person = list.find((c) => c.id === params.id)!;
      person.active = active;
      calls.push(`${active ? 'reactivate' : 'deactivate'} ${person.name}`);
      return HttpResponse.json(person);
    }),
    http.post('*/api/collaborators/:id/anonymize', ({ params }) => {
      const person = list.find((c) => c.id === params.id)!;
      Object.assign(person, { name: 'Ex-colaborador', anonymized: true });
      calls.push('anonymize');
      return HttpResponse.json(person);
    }),
  );
  return { calls };
}

describe('Collaborators management', () => {
  it('the Administrator creates a local account and sees the temporary password once', async () => {
    simulateAuth({ session: admin });
    simulateCollaborators();
    renderApp('/admin/collaborators');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Nome'), 'Bruno Lima');
    await user.type(screen.getByLabelText('E-mail'), 'bruno@company.test');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Conta criada para Bruno Lima')).toBeInTheDocument();
    expect(screen.getByText('Tmp-xyz-123')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(await within(table).findByText('bruno@company.test')).toBeInTheDocument();
  });

  it('warns when the e-mail is already in use', async () => {
    simulateAuth({ session: admin });
    simulateCollaborators();
    renderApp('/admin/collaborators');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Nome'), 'Outra Ana');
    await user.type(screen.getByLabelText('E-mail'), admin.email);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um Colaborador com este e-mail.',
    );
  });

  it('deactivates, reactivates and anonymizes after a warning', async () => {
    simulateAuth({ session: admin });
    const { calls } = simulateCollaborators();
    renderApp('/admin/collaborators');
    const user = userEvent.setup();

    const row = (await screen.findByText('Carla Dias')).closest('tr')!;
    expect(within(row).queryByRole('button', { name: 'Anonimizar' })).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Desativar' }));
    expect(await within(row).findByText('Inativo')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Reativar' }));
    expect(await within(row).findByText('Ativo')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Desativar' }));
    await user.click(await within(row).findByRole('button', { name: 'Anonimizar' }));

    expect(within(row).getByText(/Isso apaga para sempre/)).toBeInTheDocument();
    expect(calls).not.toContain('anonymize'); // asked first
    await user.click(within(row).getByRole('button', { name: 'Anonimizar para sempre' }));

    const after = (await screen.findByText('Ex-colaborador')).closest('tr')!;
    expect(within(after).getByText('Anonimizado')).toBeInTheDocument();
    expect(calls).toEqual([
      'deactivate Carla Dias',
      'reactivate Carla Dias',
      'deactivate Carla Dias',
      'anonymize',
    ]);
  });
});
