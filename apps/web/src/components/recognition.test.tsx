import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { sampleIdea, simulateIdeas, TI } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const CATEGORY = { id: TI.id, name: TI.name };

describe('Recognition', () => {
  it('the home page credits the latest Ideas Done, linking to the Author profile', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    server.use(
      http.get('*/api/recognition/recently-completed', () =>
        HttpResponse.json([
          {
            number: 12,
            title: 'Relatório automático',
            category: CATEGORY,
            completedAt: '2026-10-10T12:00:00.000Z',
            hiddenAuthorship: false,
            author: { id: ana.id, name: 'Ana Souza' },
          },
          {
            number: 13,
            title: 'Ideia anônima',
            category: CATEGORY,
            completedAt: '2026-10-09T12:00:00.000Z',
            hiddenAuthorship: true,
            author: { id: '00000000-0000-4000-8000-000000000001', name: 'Colaborador anônimo' },
          },
        ]),
      ),
      http.get(`*/api/people/${ana.id}`, () =>
        HttpResponse.json({
          id: ana.id,
          name: 'Ana Souza',
          department: 'Financeiro',
          active: true,
          completed: [
            {
              number: 12,
              title: 'Relatório automático',
              category: CATEGORY,
              completedAt: '2026-10-10T12:00:00.000Z',
              likes: 4,
              hiddenAuthorship: false,
            },
          ],
          likesOnCompleted: 4,
        }),
      ),
    );
    renderApp('/');
    const user = userEvent.setup();

    const panel = await screen.findByRole('region', { name: 'Concluída recentemente' });
    expect(panel).toHaveTextContent('#12 Relatório automático');
    // No link for whoever chose to stay hidden.
    expect(panel).toHaveTextContent('Colaborador anônimo');
    expect(screen.queryByRole('link', { name: 'Colaborador anônimo' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ana Souza' }));
    expect(await screen.findByRole('heading', { name: 'Ana Souza' })).toBeInTheDocument();
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
    expect(screen.getByText('1 ideia concluída · 4 curtidas recebidas nela')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#12 Relatório automático' })).toBeInTheDocument();
  });

  it('shows nothing on the home page while no Idea is Done', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    server.use(http.get('*/api/recognition/recently-completed', () => HttpResponse.json([])));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Ideias' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /recentemente/ })).not.toBeInTheDocument();
  });

  it('the Author name on an Idea leads to the profile', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({ idea: sampleIdea({ author: { id: ana.id, name: 'Ana Souza' } }) });
    renderApp('/ideas/7');
    expect(await screen.findByRole('link', { name: 'Ana Souza' })).toHaveAttribute(
      'href',
      `/people/${ana.id}`,
    );
  });
});
