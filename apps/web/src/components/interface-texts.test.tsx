import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { ana, DEFAULT_TEXTS, simulateAuth } from '@/test/api';
import { simulateIdeas } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };

function withTexts(texts: Partial<typeof DEFAULT_TEXTS>) {
  const branding = {
    name: 'SIM',
    primaryColor: null,
    loginTitle: '',
    loginText: '',
    texts: { ...DEFAULT_TEXTS, ...texts },
    logoLight: null,
    logoDark: null,
    favicon: null,
    loginImage: null,
  };
  const patches: unknown[] = [];
  server.use(
    http.get('*/api/branding', () => HttpResponse.json(branding)),
    http.patch('*/api/branding', async ({ request }) => {
      patches.push(await request.json());
      return HttpResponse.json(branding);
    }),
  );
  return { patches };
}

describe('Interface texts', () => {
  afterEach(() => i18n.changeLanguage('pt-BR'));

  it('shows the company texts, and the SIM default where there is none', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    withTexts({
      homeTitle: { 'pt-BR': 'Melhoria Contínua', en: 'Continuous Improvement' },
      newIdeaButton: { 'pt-BR': 'Enviar sugestão', en: null },
      newIdeaGuidance: { 'pt-BR': 'Pense no custo.\nE em quem é afetado.', en: null },
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Melhoria Contínua' })).toBeInTheDocument();
    expect(screen.getByText('Proponha, apoie e acompanhe melhorias para a empresa.')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('link', { name: /Enviar sugestão/ }));
    expect(await screen.findByText(/Pense no custo\./)).toHaveTextContent(
      'Pense no custo. E em quem é afetado.',
    );
  });

  it('follows the language of the page', async () => {
    await i18n.changeLanguage('en');
    simulateAuth({ session: ana });
    simulateIdeas();
    withTexts({ homeTitle: { 'pt-BR': 'Melhoria Contínua', en: 'Continuous Improvement' } });
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Continuous Improvement' }),
    ).toBeInTheDocument();
  });

  it('the Administrator edits them per language on the identity page', async () => {
    simulateAuth({ session: admin });
    const { patches } = withTexts({ homeTitle: { 'pt-BR': 'Melhoria Contínua', en: null } });
    renderApp('/admin/branding');
    const user = userEvent.setup();

    const title = await screen.findByRole('textbox', {
      name: 'Página inicial: título (Português)',
    });
    const english = screen.getByRole('textbox', { name: 'Página inicial: título (Inglês)' });
    expect(title).toHaveValue('Melhoria Contínua');
    // The default shows as a hint, in each language.
    expect(english).toHaveAttribute('placeholder', 'Ideas');
    expect(
      screen.getByRole('textbox', {
        name: 'Nova ideia: orientação no topo do formulário (Português)',
      }),
    ).toHaveAttribute('placeholder', '(nenhum texto por padrão)');
    await user.clear(title);
    await user.type(english, 'Continuous Improvement');
    await user.click(screen.getByRole('button', { name: 'Salvar textos' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    const sent = (patches[0] as { texts: Record<string, Record<string, string>> }).texts;
    expect(sent.homeTitle).toEqual({ 'pt-BR': '', en: 'Continuous Improvement' });
    expect(sent.similarHelp).toEqual({ 'pt-BR': '', en: '' });
  });
});
