import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ana, simularAuth } from '@/test/api';
import { renderApp } from '@/test/render';

describe('acesso ao SIM', () => {
  it('sem sessão, leva para o login guardando a página pedida', async () => {
    simularAuth({});
    const { router } = renderApp('/admin/colaboradores');
    expect(await screen.findByRole('heading', { name: 'Entrar no SIM' })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ retorno: '/admin/colaboradores' });
  });

  it('entra com e-mail e senha e chega na lista de Ideias', async () => {
    simularAuth({ aoEntrar: ana });
    const { router } = renderApp('/entrar');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@empresa.test');
    await usuario.type(screen.getByLabelText('Senha'), 'senha-correta');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Ideias' })).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('avisa quando as credenciais são inválidas', async () => {
    simularAuth({ aoEntrar: ana });
    renderApp('/entrar');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@empresa.test');
    await usuario.type(screen.getByLabelText('Senha'), 'errada');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('pede para aguardar quando há tentativas demais', async () => {
    simularAuth({ aoEntrar: ana, bloqueado: true });
    renderApp('/entrar');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@empresa.test');
    await usuario.type(screen.getByLabelText('Senha'), 'senha-correta');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
  });

  it('com senha temporária, exige a troca antes de liberar o sistema', async () => {
    simularAuth({ sessao: { ...ana, deveTrocarSenha: true } });
    renderApp('/');
    const usuario = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Defina sua senha' })).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Senha temporária'), 'temporaria');
    await usuario.type(screen.getByLabelText('Nova senha'), 'curta');
    await usuario.type(screen.getByLabelText('Confirme a nova senha'), 'curta');
    await usuario.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByText('Use pelo menos 12 caracteres.')).toBeInTheDocument();

    await usuario.clear(screen.getByLabelText('Nova senha'));
    await usuario.clear(screen.getByLabelText('Confirme a nova senha'));
    await usuario.type(screen.getByLabelText('Nova senha'), 'uma-senha-bem-longa');
    await usuario.type(screen.getByLabelText('Confirme a nova senha'), 'uma-senha-bem-longa');
    await usuario.click(screen.getByRole('button', { name: 'Salvar senha' }));

    expect(await screen.findByRole('heading', { name: 'Ideias' })).toBeInTheDocument();
  });

  it('oferece o SSO com o rótulo configurado e preserva a página de retorno', async () => {
    simularAuth({ sso: { habilitado: true, rotulo: 'Entrar com a conta Acme' } });
    renderApp('/entrar?retorno=%2Fideias%2F42');
    const botao = await screen.findByRole('link', { name: 'Entrar com a conta Acme' });
    expect(botao).toHaveAttribute('href', '/api/auth/sso/entrar?retorno=%2Fideias%2F42');
  });

  it('explica por que o SSO falhou', async () => {
    simularAuth({});
    renderApp('/entrar?erro=inativo');
    expect(await screen.findByText(/Seu acesso ao SIM está desativado/)).toBeInTheDocument();
  });

  it('Colaborador comum não vê nem acessa a gestão de Colaboradores', async () => {
    simularAuth({ sessao: ana });
    const { router } = renderApp('/admin/colaboradores');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('link', { name: 'Colaboradores' })).not.toBeInTheDocument();
  });

  it('sair encerra a sessão e volta ao login', async () => {
    simularAuth({ sessao: ana });
    renderApp('/');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Entrar no SIM' })).toBeInTheDocument();
  });
});
