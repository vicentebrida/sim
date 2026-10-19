import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { renderApp } from '@/test/render';

describe('access to SIM', () => {
  it('without a session, goes to login keeping the requested page', async () => {
    simulateAuth({});
    const { router } = renderApp('/admin/collaborators');
    expect(await screen.findByRole('heading', { name: 'Entrar no SIM' })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ returnTo: '/admin/collaborators' });
  });

  it('signs in with e-mail and password and lands on the Ideas list', async () => {
    simulateAuth({ onLogin: ana });
    const { router } = renderApp('/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-mail'), 'ana@company.test');
    await user.type(screen.getByLabelText('Senha'), 'right-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Ideias' })).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('warns when the credentials are invalid', async () => {
    simulateAuth({ onLogin: ana });
    renderApp('/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-mail'), 'ana@company.test');
    await user.type(screen.getByLabelText('Senha'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('asks to wait when there are too many attempts', async () => {
    simulateAuth({ onLogin: ana, locked: true });
    renderApp('/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-mail'), 'ana@company.test');
    await user.type(screen.getByLabelText('Senha'), 'right-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
  });

  it('with a temporary password, requires changing it before opening the system', async () => {
    simulateAuth({ session: { ...ana, mustChangePassword: true } });
    renderApp('/');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Defina sua senha' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Senha temporária'), 'temporary');
    await user.type(screen.getByLabelText('Nova senha'), 'short');
    await user.type(screen.getByLabelText('Confirme a nova senha'), 'short');
    await user.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByText('Use pelo menos 12 caracteres.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Nova senha'));
    await user.clear(screen.getByLabelText('Confirme a nova senha'));
    await user.type(screen.getByLabelText('Nova senha'), 'a-really-long-password');
    await user.type(screen.getByLabelText('Confirme a nova senha'), 'a-really-long-password');
    await user.click(screen.getByRole('button', { name: 'Salvar senha' }));

    expect(await screen.findByRole('heading', { name: 'Ideias' })).toBeInTheDocument();
  });

  it('offers SSO with the configured label and keeps the return page', async () => {
    simulateAuth({ sso: { enabled: true, label: 'Entrar com a conta Acme' } });
    renderApp('/login?returnTo=%2Fideas%2F42');
    const button = await screen.findByRole('link', { name: 'Entrar com a conta Acme' });
    expect(button).toHaveAttribute('href', '/api/auth/sso/start?returnTo=%2Fideas%2F42');
  });

  it('uses a translated SSO label when none is configured', async () => {
    simulateAuth({ sso: { enabled: true, label: null } });
    renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Entrar com SSO' })).toBeInTheDocument();
  });

  it('explains why SSO failed', async () => {
    simulateAuth({});
    renderApp('/login?error=inactive');
    expect(await screen.findByText(/Seu acesso ao SIM está desativado/)).toBeInTheDocument();
  });

  it('a regular Collaborator neither sees nor reaches the Collaborators management', async () => {
    simulateAuth({ session: ana });
    const { router } = renderApp('/admin/collaborators');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('link', { name: 'Colaboradores' })).not.toBeInTheDocument();
  });

  it('signing out ends the session and goes back to login', async () => {
    simulateAuth({ session: ana });
    renderApp('/');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Entrar no SIM' })).toBeInTheDocument();
  });
});
