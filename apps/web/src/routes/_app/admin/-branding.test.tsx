import type { BrandingDtoOutput } from '@sim/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { readableForeground } from '@/lib/branding';
import { ana, DEFAULT_TEXTS, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };
const EMPTY: BrandingDtoOutput = {
  name: 'SIM',
  primaryColor: null,
  loginTitle: '',
  loginText: '',
  texts: DEFAULT_TEXTS,
  logoLight: null,
  logoDark: null,
  favicon: null,
  loginImage: null,
};

/** In-memory branding API. */
function simulateBranding(initial: Partial<BrandingDtoOutput> = {}) {
  let branding = { ...EMPTY, ...initial };
  const patches: unknown[] = [];
  server.use(
    http.get('*/api/branding', () => HttpResponse.json(branding)),
    http.patch('*/api/branding', async ({ request }) => {
      const data = (await request.json()) as object;
      patches.push(data);
      branding = { ...branding, ...data };
      return HttpResponse.json(branding);
    }),
  );
  return { patches };
}

describe('readableForeground', () => {
  it('picks the text color that reads on the background', () => {
    expect(readableForeground('#ffee00')).toBe('#111111');
    expect(readableForeground('#102030')).toBe('#ffffff');
  });
});

describe('Identity', () => {
  it('wears the installation color, name and login texts', async () => {
    simulateAuth({});
    simulateBranding({
      name: 'Acme Ideias',
      primaryColor: '#0a7d5a',
      loginTitle: 'Bem-vindo à Acme',
      loginText: 'Compartilhe suas ideias.',
    });
    renderApp('/login');

    expect(await screen.findByText('Bem-vindo à Acme')).toBeInTheDocument();
    expect(screen.getByText('Compartilhe suas ideias.')).toBeInTheDocument();
    expect(screen.getByText('Acme Ideias')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#0a7d5a'),
    );
    expect(document.title).toBe('Acme Ideias');
  });

  it('shows the logo instead of the name', async () => {
    simulateAuth({});
    simulateBranding({ logoLight: '/api/branding/assets/logoLight?v=1' });
    renderApp('/login');
    expect(await screen.findByRole('img', { name: 'SIM' })).toHaveAttribute(
      'src',
      '/api/branding/assets/logoLight?v=1',
    );
  });
});

describe('Branding screen', () => {
  it('saves the name, color and login texts', async () => {
    simulateAuth({ session: admin });
    const { patches } = simulateBranding();
    renderApp('/admin/branding');
    const user = userEvent.setup();

    const name = await screen.findByLabelText('Nome da instalação');
    await user.clear(name);
    await user.type(name, 'Acme');
    await user.type(screen.getByLabelText('Título da página de login'), 'Olá');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Identidade salva.')).toBeInTheDocument();
    expect(patches).toEqual([
      { name: 'Acme', primaryColor: null, loginTitle: 'Olá', loginText: '' },
    ]);
  });
});
