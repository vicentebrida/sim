import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { FIELDS, sampleIdea, simulateIdeas, TI } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('Idea versions', () => {
  it('is not offered for an Idea that was never edited', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    renderApp('/ideas/7');
    await screen.findByRole('heading', { name: 'Relatório mais rápido' });
    expect(
      screen.queryByRole('button', { name: 'Ver versões anteriores' }),
    ).not.toBeInTheDocument();
  });

  it('shows the earlier texts on demand', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({ idea: sampleIdea({ editedAt: '2026-10-03T10:00:00.000Z' }) });
    server.use(
      http.get('*/api/ideas/7/versions', () =>
        HttpResponse.json([
          {
            version: 1,
            title: 'Relatório lento',
            category: { id: TI.id, name: TI.name },
            answers: [
              {
                fieldId: FIELDS[0]!.id,
                label: 'Situação atual',
                type: 'long_text',
                value: 'Leva 3 horas',
              },
            ],
            validFrom: '2026-10-01T12:00:00.000Z',
            replacedAt: '2026-10-03T10:00:00.000Z',
          },
        ]),
      ),
    );
    renderApp('/ideas/7');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Ver versões anteriores' }));
    const list = await screen.findByRole('list', { name: 'Versões anteriores' });
    expect(within(list).getByText('Relatório lento')).toBeInTheDocument();
    expect(within(list).getByText('Leva 3 horas')).toBeInTheDocument();
    expect(within(list).getByText(/Versão 1/)).toBeInTheDocument();
  });
});
