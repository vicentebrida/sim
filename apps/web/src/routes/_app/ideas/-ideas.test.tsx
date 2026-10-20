import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { FIELDS, sampleIdea, simulateIdeas, TI } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('new Idea', () => {
  it('requires the required fields to publish and goes to the created Idea', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas();
    const { router } = renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Relatório mais rápido');
    await user.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    expect(screen.getByText(TI.description)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Campo obrigatório.')).toBeInTheDocument();
    expect(received.filter((r) => r.method === 'POST')).toHaveLength(0);

    await user.type(screen.getByLabelText('Situação atual *'), 'Leva 2 horas');
    await user.click(screen.getByRole('radio', { name: 'Sim' }));
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/ideas/7'));
    expect(received.find((r) => r.method === 'POST')?.body).toEqual({
      title: 'Relatório mais rápido',
      categoryId: TI.id,
      values: { [FIELDS[0]!.id]: 'Leva 2 horas', [FIELDS[1]!.id]: true },
      hiddenAuthorship: false,
      publish: true,
    });
  });

  it('saves a Draft even without the required fields', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas();
    renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Ainda pensando');
    await user.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() =>
      expect(received.find((r) => r.method === 'POST')?.body).toMatchObject({
        title: 'Ainda pensando',
        values: {},
        publish: false,
      }),
    );
  });

  it('only offers to publish when the Administrator turned Drafts off', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    server.use(
      http.get('*/api/statuses', () =>
        HttpResponse.json([
          {
            status: 'draft',
            label: null,
            color: null,
            description: '',
            enabled: false,
            optional: true,
          },
        ]),
      ),
    );
    renderApp('/ideas/new');

    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument(),
    );
  });
});

describe('Idea page', () => {
  it('a Reviewer changes the Status with a justification and the History updates', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({
      idea: sampleIdea({
        permissions: {
          ...sampleIdea().permissions,
          canReview: true,
          transitions: ['under_review', 'duplicate', 'archived'],
        },
      }),
    });
    renderApp('/ideas/7');
    const user = userEvent.setup();

    expect(
      await screen.findByRole('heading', { name: 'Relatório mais rápido' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Leva 2 horas')).toBeInTheDocument();
    expect(screen.getByText('Ana Souza publicou a ideia')).toBeInTheDocument();

    const apply = screen.getByRole('button', { name: 'Aplicar' });
    await user.selectOptions(screen.getByLabelText('Novo status'), 'under_review');
    expect(apply).toBeDisabled();
    await user.type(screen.getByLabelText('Justificativa'), 'Vamos medir o tempo');
    await user.click(apply);

    expect(await screen.findByText('Bruno mudou de Aberta para Em análise')).toBeInTheDocument();
    expect(received.find((r) => r.url.pathname.endsWith('/status'))?.body).toEqual({
      to: 'under_review',
      justification: 'Vamos medir o tempo',
    });
  });

  it('a Collaborator without a role does not see the review panel', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    renderApp('/ideas/7');
    expect(
      await screen.findByRole('heading', { name: 'Relatório mais rápido' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Avaliação' })).not.toBeInTheDocument();
  });

  it('a Duplicate shows the way to the original Idea', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({
      idea: sampleIdea({
        status: 'duplicate',
        originalIdea: { number: 3, title: 'Relatórios agendados' },
      }),
    });
    renderApp('/ideas/7');
    const link = await screen.findByRole('link', { name: 'Ideia #3: Relatórios agendados' });
    expect(link).toHaveAttribute('href', '/ideas/3');
  });
});

describe('Likes', () => {
  const bruno = { ...ana, id: '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b', name: 'Bruno Lima' };
  const carla = { id: '8b3e4c6a-2f9d-4b7a-9c73-5e4d3f2a1b0c', name: 'Carla Dias' };

  it('a colleague likes, sees the counter go up and takes it back', async () => {
    simulateAuth({ session: bruno });
    const { received } = simulateIdeas({
      idea: sampleIdea({
        likes: { total: 1, liked: false },
        permissions: { ...sampleIdea().permissions, canLike: true },
      }),
      likes: {
        me: bruno,
        others: [{ collaborator: carla, createdAt: '2026-10-02T10:00:00.000Z' }],
      },
    });
    renderApp('/ideas/7');
    const user = userEvent.setup();

    const like = await screen.findByRole('button', { name: 'Curtir' });
    expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1 curtida')).toBeInTheDocument();

    await user.click(like);
    expect(await screen.findByRole('button', { name: 'Curtida' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('2 curtidas')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver quem curtiu' }));
    const who = await screen.findByRole('list', { name: 'Ver quem curtiu' });
    expect(
      within(who)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Bruno Lima', 'Carla Dias']);

    await user.click(screen.getByRole('button', { name: 'Curtida' }));
    expect(await screen.findByRole('button', { name: 'Curtir' })).toBeInTheDocument();
    expect(received.map((r) => r.method)).toEqual(['PUT', 'DELETE']);
  });

  it('the Author sees the Likes but cannot like her own Idea', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({ idea: sampleIdea({ likes: { total: 3, liked: false } }) });
    renderApp('/ideas/7');

    expect(await screen.findByText('Você não pode curtir a própria ideia.')).toBeInTheDocument();
    expect(screen.getByText('3 curtidas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Curtir' })).not.toBeInTheDocument();
  });

  it('on a Done Idea the Likes show as frozen', async () => {
    simulateAuth({ session: bruno });
    simulateIdeas({ idea: sampleIdea({ status: 'done', likes: { total: 5, liked: true } }) });
    renderApp('/ideas/7');

    expect(
      await screen.findByText('As curtidas estão congeladas neste status.'),
    ).toBeInTheDocument();
    expect(screen.getByText('5 curtidas')).toBeInTheDocument();
  });
});

describe('Ideas list', () => {
  it('shows the Ideas and keeps the Status filter in the URL', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas();
    const { router } = renderApp('/');
    const user = userEvent.setup();

    expect(await screen.findByRole('link', { name: /Relatório mais rápido/ })).toHaveAttribute(
      'href',
      '/ideas/7',
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'done');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ status: 'done' }));
    await waitFor(() =>
      expect(received.some((r) => r.url.searchParams.get('status') === 'done')).toBe(true),
    );
  });

  it('sorts by trending by default and keeps another order in the URL', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({ idea: sampleIdea({ likes: { total: 4, liked: false } }) });
    const { router } = renderApp('/');
    const user = userEvent.setup();

    expect(await screen.findByText('4 curtidas')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('trending');

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'most_liked');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: 'most_liked' }));
    await waitFor(() =>
      expect(received.some((r) => r.url.searchParams.get('sort') === 'most_liked')).toBe(true),
    );
  });
});
