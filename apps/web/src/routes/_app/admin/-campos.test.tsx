import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simularAuth } from '@/test/api';
import { CAMPOS } from '@/test/ideias';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, administrador: true };

describe('gestão de Campos Personalizados', () => {
  it('cria um campo de seleção com as opções digitadas uma por linha', async () => {
    simularAuth({ sessao: admin });
    let criado: unknown;
    server.use(
      http.get('*/api/campos-personalizados', () => HttpResponse.json(CAMPOS)),
      http.post('*/api/campos-personalizados', async ({ request }) => {
        criado = await request.json();
        return HttpResponse.json({ ...CAMPOS[0], ...(criado as object) }, { status: 201 });
      }),
    );
    renderApp('/admin/campos');
    const usuario = userEvent.setup();

    await usuario.selectOptions(await screen.findByLabelText('Tipo'), 'selecao_unica');
    await usuario.type(screen.getByLabelText('Rótulo'), 'Área');
    await usuario.type(
      screen.getByLabelText('Opções (uma por linha)'),
      'Fábrica{enter} Escritório {enter}{enter}Fábrica',
    );
    await usuario.click(screen.getByRole('button', { name: 'Criar campo' }));

    await expect
      .poll(() => criado)
      .toEqual({
        rotulo: 'Área',
        ajuda: '',
        tipo: 'selecao_unica',
        obrigatorio: false,
        opcoes: ['Fábrica', 'Escritório'],
        usarNaDeteccao: false,
      });
  });

  it('explica por que um campo em uso não pode ser excluído', async () => {
    simularAuth({ sessao: admin });
    server.use(
      http.get('*/api/campos-personalizados', () => HttpResponse.json(CAMPOS)),
      http.delete('*/api/campos-personalizados/:id', () =>
        HttpResponse.json({ message: 'em uso' }, { status: 409 }),
      ),
    );
    renderApp('/admin/campos');
    const usuario = userEvent.setup();

    const [excluir] = await screen.findAllByRole('button', { name: 'Excluir' });
    await usuario.click(excluir!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Desative-o em vez de excluir');
  });
});
