import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { BRUNO, sampleComment, sampleIdea, simulateIdeas } from '@/test/ideas';
import { renderApp } from '@/test/render';

const CARLA = { id: '8b3e4c6a-2f9d-4b7a-9c73-5e4d3f2a1b0c', name: 'Carla Dias' };

const discussion = async () => within(await screen.findByRole('region', { name: 'Discussão' }));

describe('Idea discussion', () => {
  it('mixes Comments and History in chronological order', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({
      idea: sampleIdea({
        history: [
          ...sampleIdea().history,
          {
            id: '66666666-6666-4666-8666-666666666666',
            type: 'status',
            from: 'open',
            to: 'under_review',
            justification: 'Vamos avaliar',
            collaborator: BRUNO,
            createdAt: '2026-10-03T09:00:00.000Z',
          },
        ],
      }),
      comments: [sampleComment({ text: 'Apoio total', createdAt: '2026-10-02T10:00:00.000Z' })],
    });
    renderApp('/ideas/7');

    const region = await discussion();
    await waitFor(() => expect(region.getAllByRole('listitem')).toHaveLength(3));
    expect(region.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ana Souza publicou a ideia'),
      expect.stringContaining('Apoio total'),
      expect.stringContaining('Bruno Lima mudou de Aberta para Em análise'),
    ]);
  });

  it('comments mentioning someone picked from the suggestions', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({ mentionable: [BRUNO, CARLA] });
    renderApp('/ideas/7');
    const user = userEvent.setup();

    const editor = await screen.findByRole('combobox', { name: 'Escreva um comentário' });
    await user.type(editor, 'Ótima ideia, @bru');
    const suggestion = await screen.findByRole('option', { name: 'Bruno Lima' });
    expect(screen.queryByRole('option', { name: 'Carla Dias' })).not.toBeInTheDocument();
    expect(suggestion).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(editor).toHaveTextContent('Ótima ideia, @Bruno Lima');

    await user.type(editor, 'pode ajudar?');
    await user.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() =>
      expect(received.find((r) => r.url.pathname.endsWith('/comments'))?.body).toEqual({
        text: `Ótima ideia, @[Bruno Lima](${BRUNO.id}) pode ajudar?`,
      }),
    );
    const comment = await screen.findByRole('article', { name: 'Comentário de Ana Souza' });
    expect(within(comment).getByText('@Bruno Lima')).toHaveClass('text-primary');
    expect(editor).toHaveTextContent('');
  });

  it('replies to a Comment', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({ comments: [sampleComment()] });
    renderApp('/ideas/7');
    const user = userEvent.setup();

    const comment = await screen.findByRole('article', { name: 'Comentário de Bruno Lima' });
    await user.click(within(comment).getByRole('button', { name: 'Responder' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Responder a Bruno Lima' }),
      'Obrigada pelo apoio',
    );
    const replies = screen.getByRole('list', { name: 'Respostas' });
    await user.click(within(replies).getByRole('button', { name: 'Responder' }));

    // `selector: 'p'`: the editor also holds the typed text until it unmounts.
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Respostas' })).getByText('Obrigada pelo apoio', {
          selector: 'p',
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('combobox', { name: 'Responder a Bruno Lima' })).toBeNull();
    expect(received.find((r) => r.method === 'POST')?.body).toEqual({
      text: 'Obrigada pelo apoio',
      replyToId: sampleComment().id,
    });
  });

  it('a moderator hides with a reason, which everyone sees', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({
      me: BRUNO,
      comments: [
        sampleComment({
          author: CARLA,
          text: 'Comentário fora do tom',
          permissions: { canReply: true, canEdit: false, canRemove: false, canHide: true },
        }),
      ],
    });
    renderApp('/ideas/7');
    const user = userEvent.setup();

    const comment = await screen.findByRole('article', { name: 'Comentário de Carla Dias' });
    await user.click(within(comment).getByRole('button', { name: 'Ocultar' }));
    const confirm = within(comment).getByRole('button', { name: 'Ocultar comentário' });
    expect(confirm).toBeDisabled();
    await user.type(within(comment).getByLabelText('Motivo da ocultação'), 'Desrespeita as regras');
    await user.click(confirm);

    expect(
      await within(comment).findByText('Comentário oculto por Bruno Lima: Desrespeita as regras'),
    ).toBeInTheDocument();
  });

  it('the writer removes in two steps and it becomes "Comment removed"', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({
      comments: [
        sampleComment({
          author: { id: ana.id, name: ana.name },
          text: 'Escrevi errado',
          permissions: { canReply: true, canEdit: true, canRemove: true, canHide: false },
        }),
      ],
    });
    renderApp('/ideas/7');
    const user = userEvent.setup();

    const comment = await screen.findByRole('article', { name: 'Comentário de Ana Souza' });
    expect(within(comment).getByText('Autor')).toBeInTheDocument();
    await user.click(within(comment).getByRole('button', { name: 'Remover' }));
    await user.click(within(comment).getByRole('button', { name: 'Confirmar remoção' }));

    expect(await within(comment).findByText('Comentário removido.')).toBeInTheDocument();
    expect(within(comment).queryByText('Escrevi errado')).not.toBeInTheDocument();
  });
});
