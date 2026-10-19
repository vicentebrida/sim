import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ana, simularAuth } from '@/test/api';
import { BRUNO, comentarioDeExemplo, ideiaDeExemplo, simularIdeias } from '@/test/ideias';
import { renderApp } from '@/test/render';

const CARLA = { id: '8b3e4c6a-2f9d-4b7a-9c73-5e4d3f2a1b0c', nome: 'Carla Dias' };

const discussao = async () => within(await screen.findByRole('region', { name: 'Discussão' }));

describe('Discussão da Ideia', () => {
  it('mistura Comentários e Histórico em ordem cronológica', async () => {
    simularAuth({ sessao: ana });
    simularIdeias({
      ideia: ideiaDeExemplo({
        historico: [
          ...ideiaDeExemplo().historico,
          {
            id: '66666666-6666-4666-8666-666666666666',
            tipo: 'status',
            de: 'aberta',
            para: 'em_analise',
            justificativa: 'Vamos avaliar',
            colaborador: BRUNO,
            em: '2026-10-03T09:00:00.000Z',
          },
        ],
      }),
      comentarios: [
        comentarioDeExemplo({ texto: 'Apoio total', criadoEm: '2026-10-02T10:00:00Z' }),
      ],
    });
    renderApp('/ideias/7');

    const regiao = await discussao();
    await waitFor(() => expect(regiao.getAllByRole('listitem')).toHaveLength(3));
    expect(regiao.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ana Souza publicou a ideia'),
      expect.stringContaining('Apoio total'),
      expect.stringContaining('Bruno Lima mudou de Aberta para Em análise'),
    ]);
  });

  it('comenta mencionando alguém pela lista de sugestões', async () => {
    simularAuth({ sessao: ana });
    const { recebidas } = simularIdeias({ mencionaveis: [BRUNO, CARLA] });
    renderApp('/ideias/7');
    const usuario = userEvent.setup();

    const editor = await screen.findByRole('combobox', { name: 'Escreva um comentário' });
    await usuario.type(editor, 'Ótima ideia, @bru');
    const sugestao = await screen.findByRole('option', { name: 'Bruno Lima' });
    expect(screen.queryByRole('option', { name: 'Carla Dias' })).not.toBeInTheDocument();
    expect(sugestao).toHaveAttribute('aria-selected', 'true');
    await usuario.keyboard('{Enter}');
    expect(editor).toHaveValue('Ótima ideia, @Bruno Lima ');

    await usuario.type(editor, 'pode ajudar?');
    await usuario.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() =>
      expect(recebidas.find((r) => r.url.pathname.endsWith('/comentarios'))?.corpo).toEqual({
        texto: `Ótima ideia, @[Bruno Lima](${BRUNO.id}) pode ajudar?`,
      }),
    );
    const comentario = await screen.findByRole('article', { name: 'Comentário de Ana Souza' });
    expect(within(comentario).getByText('@Bruno Lima')).toHaveClass('text-primary');
    expect(editor).toHaveValue('');
  });

  it('responde um Comentário', async () => {
    simularAuth({ sessao: ana });
    const { recebidas } = simularIdeias({ comentarios: [comentarioDeExemplo()] });
    renderApp('/ideias/7');
    const usuario = userEvent.setup();

    const comentario = await screen.findByRole('article', { name: 'Comentário de Bruno Lima' });
    await usuario.click(within(comentario).getByRole('button', { name: 'Responder' }));
    await usuario.type(
      screen.getByRole('combobox', { name: 'Responder a Bruno Lima' }),
      'Obrigada pelo apoio',
    );
    const respostas = screen.getByRole('list', { name: 'Respostas' });
    await usuario.click(within(respostas).getByRole('button', { name: 'Responder' }));

    // `selector: 'p'`: o textarea controlado também contém o texto digitado até ser desmontado.
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Respostas' })).getByText('Obrigada pelo apoio', {
          selector: 'p',
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('combobox', { name: 'Responder a Bruno Lima' })).toBeNull();
    expect(recebidas.find((r) => r.metodo === 'POST')?.corpo).toEqual({
      texto: 'Obrigada pelo apoio',
      respostaAId: comentarioDeExemplo().id,
    });
  });

  it('quem modera oculta com motivo, que fica visível para todos', async () => {
    simularAuth({ sessao: ana });
    simularIdeias({
      eu: BRUNO,
      comentarios: [
        comentarioDeExemplo({
          autor: CARLA,
          texto: 'Comentário fora do tom',
          permissoes: {
            podeResponder: true,
            podeEditar: false,
            podeRemover: false,
            podeOcultar: true,
          },
        }),
      ],
    });
    renderApp('/ideias/7');
    const usuario = userEvent.setup();

    const comentario = await screen.findByRole('article', { name: 'Comentário de Carla Dias' });
    await usuario.click(within(comentario).getByRole('button', { name: 'Ocultar' }));
    const confirmar = within(comentario).getByRole('button', { name: 'Ocultar comentário' });
    expect(confirmar).toBeDisabled();
    await usuario.type(
      within(comentario).getByLabelText('Motivo da ocultação'),
      'Desrespeita as regras',
    );
    await usuario.click(confirmar);

    expect(
      await within(comentario).findByText(
        'Comentário oculto por Bruno Lima: Desrespeita as regras',
      ),
    ).toBeInTheDocument();
  });

  it('quem escreveu remove em dois passos e fica "Comentário removido"', async () => {
    simularAuth({ sessao: ana });
    simularIdeias({
      comentarios: [
        comentarioDeExemplo({
          autor: { id: ana.id, nome: ana.nome },
          texto: 'Escrevi errado',
          permissoes: {
            podeResponder: true,
            podeEditar: true,
            podeRemover: true,
            podeOcultar: false,
          },
        }),
      ],
    });
    renderApp('/ideias/7');
    const usuario = userEvent.setup();

    const comentario = await screen.findByRole('article', { name: 'Comentário de Ana Souza' });
    expect(within(comentario).getByText('Autor')).toBeInTheDocument();
    await usuario.click(within(comentario).getByRole('button', { name: 'Remover' }));
    await usuario.click(within(comentario).getByRole('button', { name: 'Confirmar remoção' }));

    expect(await within(comentario).findByText('Comentário removido.')).toBeInTheDocument();
    expect(within(comentario).queryByText('Escrevi errado')).not.toBeInTheDocument();
  });
});
