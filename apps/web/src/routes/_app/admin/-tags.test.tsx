import type { TagDtoOutput } from '@sim/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };

function simulateTags() {
  let tags: TagDtoOutput[] = [];
  let next = 1;
  server.use(
    http.get('*/api/tags', () => HttpResponse.json(tags)),
    http.post('*/api/tags', async ({ request }) => {
      const { name } = (await request.json()) as { name: string };
      if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
        return HttpResponse.json({ code: 'TAG_NAME_TAKEN' }, { status: 409 });
      }
      const tag = { id: `88888888-8888-4888-8888-00000000000${next++}`, name };
      tags = [...tags, tag];
      return HttpResponse.json(tag, { status: 201 });
    }),
    http.patch('*/api/tags/:id', async ({ params, request }) => {
      const { name } = (await request.json()) as { name: string };
      tags = tags.map((tag) => (tag.id === params.id ? { ...tag, name } : tag));
      return HttpResponse.json(tags.find((tag) => tag.id === params.id));
    }),
    http.delete('*/api/tags/:id', ({ params }) => {
      tags = tags.filter((tag) => tag.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

describe('Tags management', () => {
  it('creates, renames and deletes a Tag', async () => {
    simulateAuth({ session: admin });
    simulateTags();
    renderApp('/admin/tags');
    const user = userEvent.setup();

    expect(await screen.findByText('Nenhuma Etiqueta criada ainda.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nome'), 'Custo');
    await user.click(screen.getByRole('button', { name: 'Criar Etiqueta' }));
    const item = (await screen.findByText('Custo')).closest('li')!;

    await user.type(screen.getByLabelText('Nome'), 'custo');
    await user.click(screen.getByRole('button', { name: 'Criar Etiqueta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma Etiqueta com este nome.',
    );

    await user.click(within(item).getByRole('button', { name: 'Renomear' }));
    const input = within(item).getByLabelText('Nome');
    await user.clear(input);
    await user.type(input, 'Redução de custo');
    await user.click(within(item).getByRole('button', { name: 'Salvar' }));
    expect(await within(item).findByText('Redução de custo')).toBeInTheDocument();

    await user.click(within(item).getByRole('button', { name: 'Excluir' }));
    expect(within(item).getByText('Ela sai de todas as Ideias.')).toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Excluir de vez' }));
    expect(await screen.findByText('Nenhuma Etiqueta criada ainda.')).toBeInTheDocument();
  });

  it('the Administrator sees the Tags shortcut in the menu', async () => {
    simulateAuth({ session: admin });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Etiquetas' })).toBeInTheDocument();
  });
});
