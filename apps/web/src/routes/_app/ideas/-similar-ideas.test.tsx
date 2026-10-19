import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { sampleIdea, simulateIdeas, TI } from '@/test/ideas';
import { renderApp } from '@/test/render';

const SIMILAR = [
  {
    number: 3,
    title: 'Relatório de vendas mais rápido',
    status: 'under_review' as const,
    category: { id: TI.id, name: TI.name },
    likes: 12,
    score: 0.81,
  },
  {
    number: 5,
    title: 'Agendar relatórios no ERP',
    status: 'archived' as const,
    category: { id: TI.id, name: TI.name },
    likes: 2,
    score: 0.55,
  },
];

describe('Similar Ideas while writing', () => {
  it('warns about similar Ideas as the title and detection fields are typed', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({ similar: SIMILAR });
    renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Relatório de vendas');
    const panel = await screen.findByRole('region', { name: 'Ideias parecidas já existem' });
    const link = within(panel).getByRole('link', { name: /#3 Relatório de vendas mais rápido/ });
    expect(link).toHaveAttribute('href', '/ideas/3');
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(panel).getByText('12 curtidas')).toBeInTheDocument();
    expect(within(panel).getByText(/foi arquivada. Comente nela/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Situação atual *'), 'Demora duas horas');
    await waitFor(() => {
      const last = received.filter((r) => r.url.pathname.endsWith('/similar')).at(-1);
      expect(Object.fromEntries(last!.url.searchParams)).toEqual({
        title: 'Relatório de vendas',
        text: 'Demora duas horas',
      });
    });
  });

  it('only searches from 3 characters on, and waits for typing to pause', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({ similar: SIMILAR });
    renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Re');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(received.some((r) => r.url.pathname.endsWith('/similar'))).toBe(false);

    await user.type(screen.getByLabelText('Título'), 'latório');
    await screen.findByRole('region', { name: 'Ideias parecidas já existem' });
    // One search for the whole word, not one per key.
    expect(received.filter((r) => r.url.pathname.endsWith('/similar'))).toHaveLength(1);
  });

  it('does not block publishing', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({ similar: SIMILAR });
    const { router } = renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Relatório de vendas');
    await screen.findByRole('region', { name: 'Ideias parecidas já existem' });
    await user.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    await user.type(screen.getByLabelText('Situação atual *'), 'É diferente');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/ideas/7'));
    expect(received.find((r) => r.method === 'POST')?.body).toMatchObject({ publish: true });
  });

  it('when editing, leaves the Idea itself out', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas({
      idea: sampleIdea({ permissions: { ...sampleIdea().permissions, canEdit: true } }),
    });
    renderApp('/ideas/7/edit');

    await screen.findByDisplayValue('Relatório mais rápido');
    // The saved values of the detection fields are compared too.
    await waitFor(() => {
      const search = received.filter((r) => r.url.pathname.endsWith('/similar')).at(-1);
      expect(Object.fromEntries(search!.url.searchParams)).toEqual({
        title: 'Relatório mais rápido',
        text: 'Leva 2 horas',
        exclude: '7',
      });
    });
  });
});
