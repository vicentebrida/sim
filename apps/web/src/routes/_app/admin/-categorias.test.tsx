import type { CategoriaDtoOutput } from '@sim/api-client';
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
const bruno = {
  ...ana,
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  nome: 'Bruno',
  email: 'bruno@empresa.test',
};

function simularCategorias() {
  let categorias: CategoriaDtoOutput[] = [];
  let proximoId = 1;
  const id = () => `00000000-0000-4000-8000-00000000000${proximoId++}`;
  server.use(
    http.get('*/api/colaboradores', () =>
      HttpResponse.json([
        { ...admin, ativo: true },
        { ...bruno, ativo: true },
      ]),
    ),
    http.get('*/api/categorias', () => HttpResponse.json(categorias)),
    http.post('*/api/categorias', async ({ request }) => {
      const dados = (await request.json()) as { nome: string; descricao: string };
      if (categorias.some((c) => c.nome.toLowerCase() === dados.nome.toLowerCase())) {
        return HttpResponse.json({}, { status: 409 });
      }
      const categoria = { id: id(), ...dados, ativa: true, avaliadores: [] };
      categorias.push(categoria);
      return HttpResponse.json(categoria, { status: 201 });
    }),
    http.patch('*/api/categorias/:id', async ({ params, request }) => {
      const dados = (await request.json()) as Partial<CategoriaDtoOutput>;
      categorias = categorias.map((c) => (c.id === params.id ? { ...c, ...dados } : c));
      return HttpResponse.json(categorias.find((c) => c.id === params.id));
    }),
    http.put('*/api/categorias/:id/avaliadores', async ({ params, request }) => {
      const { colaboradorIds } = (await request.json()) as { colaboradorIds: string[] };
      const pessoas = [admin, bruno].filter((p) => colaboradorIds.includes(p.id));
      categorias = categorias.map((c) =>
        c.id === params.id
          ? { ...c, avaliadores: pessoas.map(({ id, nome }) => ({ id, nome })) }
          : c,
      );
      return HttpResponse.json(categorias.find((c) => c.id === params.id));
    }),
  );
}

describe('gestão de Categorias', () => {
  it('cria uma Categoria, define um Avaliador e a desativa', async () => {
    simularAuth({ sessao: admin });
    simularCategorias();
    renderApp('/admin/categorias');
    const usuario = userEvent.setup();

    expect(await screen.findByText('Nenhuma Categoria criada ainda.')).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Nome'), 'TI');
    await usuario.type(screen.getByLabelText('Descrição'), 'Sistemas e acessos');
    await usuario.click(screen.getByRole('button', { name: 'Criar Categoria' }));

    const item = (await screen.findByRole('heading', { name: 'TI' })).closest('li')!;
    expect(within(item).getByText('Sistemas e acessos')).toBeInTheDocument();
    expect(within(item).getByText(/Sem Avaliadores/)).toBeInTheDocument();

    await usuario.click(within(item).getByRole('button', { name: 'Avaliadores' }));
    await usuario.click(await within(item).findByRole('checkbox', { name: /Bruno/ }));
    await usuario.click(within(item).getByRole('button', { name: 'Salvar' }));
    expect(await within(item).findByText('Bruno')).toBeInTheDocument();

    await usuario.click(within(item).getByRole('button', { name: 'Desativar' }));
    expect(await within(item).findByText('Inativa')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
  });

  it('avisa quando o nome da Categoria já existe', async () => {
    simularAuth({ sessao: admin });
    simularCategorias();
    renderApp('/admin/categorias');
    const usuario = userEvent.setup();

    for (let vez = 0; vez < 2; vez++) {
      await usuario.type(await screen.findByLabelText('Nome'), 'RH');
      await usuario.click(screen.getByRole('button', { name: 'Criar Categoria' }));
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma Categoria com este nome.',
    );
  });

  it('Administrador vê o atalho para Categorias no menu', async () => {
    simularAuth({ sessao: admin });
    simularCategorias();
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Categorias' })).toBeInTheDocument();
  });
});
