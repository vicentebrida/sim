import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { sampleIdea, simulateIdeas, TI } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = {
  ...ana,
  id: '0b5e7c1a-2f3d-4e6a-8b9c-1d2e3f4a5b6c',
  name: 'Admin',
  administrator: true,
};
const ANONYMOUS = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Colaborador anônimo' };

function settings(hiddenAuthorshipEnabled: boolean) {
  server.use(http.get('*/api/settings', () => HttpResponse.json({ hiddenAuthorshipEnabled })));
}

describe('Hidden authorship', () => {
  it('offers to hide the name only when the installation allows it', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    renderApp('/ideas/new');
    await screen.findByLabelText('Título');
    expect(screen.queryByLabelText('Ocultar meu nome nesta ideia')).not.toBeInTheDocument();
  });

  it('sends the choice when creating the Idea', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas();
    settings(true);
    renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Ideia sensível');
    await user.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    await user.click(await screen.findByLabelText('Ocultar meu nome nesta ideia'));
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() =>
      expect(received.find((r) => r.method === 'POST')?.body).toMatchObject({
        hiddenAuthorship: true,
      }),
    );
  });

  it('an Administrator reveals the Author only after the warning', async () => {
    simulateAuth({ session: admin });
    simulateIdeas({ idea: sampleIdea({ hiddenAuthorship: true, author: ANONYMOUS }) });
    let revealed = 0;
    server.use(
      http.post('*/api/ideas/7/reveal-author', () => {
        revealed += 1;
        return HttpResponse.json({ id: ana.id, name: 'Ana Souza' });
      }),
    );
    renderApp('/ideas/7');
    const user = userEvent.setup();

    expect(await screen.findByText(/optou por ocultar o nome/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revelar autor' }));
    expect(screen.getByText(/fica registrada na Auditoria/)).toBeInTheDocument();
    expect(revealed).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Revelar e registrar' }));
    expect(await screen.findByText('Autor: Ana Souza')).toBeInTheDocument();
    expect(revealed).toBe(1);
  });

  it('a regular Collaborator has no way to reveal', async () => {
    simulateAuth({ session: { ...ana, id: '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b' } });
    simulateIdeas({ idea: sampleIdea({ hiddenAuthorship: true, author: ANONYMOUS }) });
    renderApp('/ideas/7');
    expect(await screen.findByText(/optou por ocultar o nome/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revelar autor' })).not.toBeInTheDocument();
  });

  it('the Author is told their name is hidden', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({ idea: sampleIdea({ hiddenAuthorship: true }) });
    renderApp('/ideas/7');
    expect(await screen.findByText(/Seu nome está oculto nesta ideia/)).toBeInTheDocument();
  });
});
