import type { CategoryDtoOutput } from '@sim/api-client';
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
const bruno = {
  ...ana,
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  name: 'Bruno',
  email: 'bruno@company.test',
};

function simulateCategories(initial: CategoryDtoOutput[] = []) {
  let categories = initial;
  const sent: unknown[] = [];
  let nextId = 1;
  const id = () => `00000000-0000-4000-8000-00000000000${nextId++}`;
  server.use(
    http.get('*/api/collaborators', () =>
      HttpResponse.json([
        { ...admin, active: true },
        { ...bruno, active: true },
      ]),
    ),
    http.get('*/api/categories', () => HttpResponse.json(categories)),
    http.post('*/api/categories', async ({ request }) => {
      const data = (await request.json()) as { name: string; description: string };
      if (categories.some((c) => c.name.toLowerCase() === data.name.toLowerCase())) {
        return HttpResponse.json({ code: 'CATEGORY_NAME_TAKEN' }, { status: 409 });
      }
      const category = {
        id: id(),
        ...data,
        active: true,
        stalledOpenDays: null,
        stalledReviewDays: null,
        ssoGroup: null,
        reviewers: [],
      };
      categories.push(category);
      return HttpResponse.json(category, { status: 201 });
    }),
    http.patch('*/api/categories/:id', async ({ params, request }) => {
      const data = (await request.json()) as Partial<CategoryDtoOutput>;
      categories = categories.map((c) => (c.id === params.id ? { ...c, ...data } : c));
      return HttpResponse.json(categories.find((c) => c.id === params.id));
    }),
    http.put('*/api/categories/:id/reviewers', async ({ params, request }) => {
      const { collaboratorIds } = (await request.json()) as { collaboratorIds: string[] };
      sent.push(collaboratorIds);
      const people = [admin, bruno].filter((p) => collaboratorIds.includes(p.id));
      categories = categories.map((c) =>
        c.id === params.id
          ? {
              ...c,
              reviewers: [
                ...c.reviewers.filter((r) => r.viaSso),
                ...people.map(({ id, name }) => ({ id, name, viaSso: false })),
              ],
            }
          : c,
      );
      return HttpResponse.json(categories.find((c) => c.id === params.id));
    }),
  );
  return { sent };
}

describe('Categories management', () => {
  it('creates a Category, assigns a Reviewer and deactivates it', async () => {
    simulateAuth({ session: admin });
    simulateCategories();
    renderApp('/admin/categories');
    const user = userEvent.setup();

    expect(await screen.findByText('Nenhuma Categoria criada ainda.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nome'), 'TI');
    await user.type(screen.getByLabelText('Descrição'), 'Sistemas e acessos');
    await user.click(screen.getByRole('button', { name: 'Criar Categoria' }));

    const item = (await screen.findByRole('heading', { name: 'TI' })).closest('li')!;
    expect(within(item).getByText('Sistemas e acessos')).toBeInTheDocument();
    expect(within(item).getByText(/Sem Avaliadores/)).toBeInTheDocument();

    await user.click(within(item).getByRole('button', { name: 'Avaliadores' }));
    await user.click(await within(item).findByRole('checkbox', { name: /Bruno/ }));
    await user.click(within(item).getByRole('button', { name: 'Salvar' }));
    expect(await within(item).findByText('Bruno')).toBeInTheDocument();

    await user.click(within(item).getByRole('button', { name: 'Desativar' }));
    expect(await within(item).findByText('Inativa')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
  });

  it('sets the Stalled Idea deadlines of a Category, and clears them', async () => {
    simulateAuth({ session: admin });
    simulateCategories();
    renderApp('/admin/categories');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Nome'), 'TI');
    await user.click(screen.getByRole('button', { name: 'Criar Categoria' }));
    const item = (await screen.findByRole('heading', { name: 'TI' })).closest('li')!;

    await user.click(within(item).getByRole('button', { name: 'Editar' }));
    await user.type(within(item).getByLabelText('Aberta'), '5');
    await user.click(within(item).getByRole('button', { name: 'Salvar' }));
    await user.click(await within(item).findByRole('button', { name: 'Editar' }));
    expect(within(item).getByLabelText('Aberta')).toHaveValue('5');
    expect(within(item).getByLabelText('Em análise')).toHaveValue('');

    await user.clear(within(item).getByLabelText('Aberta'));
    await user.click(within(item).getByRole('button', { name: 'Salvar' }));
    await user.click(await within(item).findByRole('button', { name: 'Editar' }));
    expect(within(item).getByLabelText('Aberta')).toHaveValue('');
  });

  it('shows who reviews through the SSO group, and leaves them out of the manual choice', async () => {
    simulateAuth({ session: admin });
    const { sent } = simulateCategories([
      {
        id: '00000000-0000-4000-8000-000000000009',
        name: 'TI',
        description: '',
        active: true,
        stalledOpenDays: null,
        stalledReviewDays: null,
        ssoGroup: 'comite-ti',
        reviewers: [{ id: bruno.id, name: 'Bruno', viaSso: true }],
      },
    ]);
    renderApp('/admin/categories');
    const user = userEvent.setup();

    const item = (await screen.findByRole('heading', { name: 'TI' })).closest('li')!;
    expect(within(item).getByText('Bruno (pelo SSO)')).toBeInTheDocument();
    expect(within(item).getByText('comite-ti')).toBeInTheDocument();

    await user.click(within(item).getByRole('button', { name: 'Avaliadores' }));
    const fromSso = await within(item).findByRole('checkbox', { name: /Bruno/ });
    expect(fromSso).toBeChecked();
    expect(fromSso).toBeDisabled();
    await user.click(within(item).getByRole('checkbox', { name: /Admin/ }));
    await user.click(within(item).getByRole('button', { name: 'Salvar' }));
    expect(await within(item).findByText('Bruno (pelo SSO), Admin')).toBeInTheDocument();
    expect(sent).toEqual([[admin.id]]);

    await user.click(within(item).getByRole('button', { name: 'Editar' }));
    expect(within(item).getByLabelText('Grupo do SSO')).toHaveValue('comite-ti');
  });

  it('warns when the Category name already exists', async () => {
    simulateAuth({ session: admin });
    simulateCategories();
    renderApp('/admin/categories');
    const user = userEvent.setup();

    for (let time = 0; time < 2; time++) {
      await user.type(await screen.findByLabelText('Nome'), 'RH');
      await user.click(screen.getByRole('button', { name: 'Criar Categoria' }));
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma Categoria com este nome.',
    );
  });
});
