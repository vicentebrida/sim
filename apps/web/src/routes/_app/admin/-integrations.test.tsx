import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };

const state = (semanticSearch: object) => ({
  sso: { mode: 'oidc' },
  smtp: { configured: true },
  storage: { kind: 's3' },
  redis: { configured: true },
  semanticSearch,
});

describe('Integrations', () => {
  it('shows the state of each integration, without any secret', async () => {
    simulateAuth({ session: admin });
    server.use(
      http.get('*/api/integrations', () =>
        HttpResponse.json(
          state({
            configured: true,
            model: 'nomic-embed-text',
            threshold: 0.75,
            total: 10,
            indexed: 8,
            pending: 2,
          }),
        ),
      ),
    );
    renderApp('/admin/integrations');

    expect(await screen.findByText('Modo OIDC.')).toBeInTheDocument();
    expect(screen.getByText('S3')).toBeInTheDocument();
    expect(screen.getByText('8 de 10 ideias indexadas · 2 aguardando')).toBeInTheDocument();
    expect(screen.getByText(/nomic-embed-text/)).toBeInTheDocument();
  });

  it('tests the connection of the semantic search and reports the result', async () => {
    simulateAuth({ session: admin });
    let ok = true;
    server.use(
      http.get('*/api/integrations', () =>
        HttpResponse.json(
          state({ configured: true, model: 'm', threshold: 0.7, total: 0, indexed: 0, pending: 0 }),
        ),
      ),
      http.post('*/api/integrations/semantic-search/test', () =>
        HttpResponse.json(
          ok
            ? { ok: true, dimensions: 768, error: null }
            : { ok: false, dimensions: null, error: 'answered 401' },
        ),
      ),
    );
    renderApp('/admin/integrations');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Testar conexão' }));
    expect(await screen.findByText(/vetores de 768 dimensões/)).toBeInTheDocument();
    ok = false;
    await user.click(screen.getByRole('button', { name: 'Testar conexão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou: answered 401');
  });

  it('explains how to turn the semantic search on', async () => {
    simulateAuth({ session: admin });
    server.use(
      http.get('*/api/integrations', () =>
        HttpResponse.json(
          state({
            configured: false,
            model: null,
            threshold: 0.75,
            total: 0,
            indexed: 0,
            pending: 0,
          }),
        ),
      ),
    );
    renderApp('/admin/integrations');
    expect(await screen.findByText(/Defina SIM_EMBEDDINGS_URL/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Testar conexão' })).not.toBeInTheDocument();
  });
});
