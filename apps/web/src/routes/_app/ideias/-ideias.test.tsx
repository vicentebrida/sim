import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ana, simularAuth } from '@/test/api';
import { CAMPOS, ideiaDeExemplo, simularIdeias, TI } from '@/test/ideias';
import { renderApp } from '@/test/render';

describe('nova Ideia', () => {
  it('exige os campos obrigatórios para publicar e leva à Ideia criada', async () => {
    simularAuth({ sessao: ana });
    const { recebidas } = simularIdeias();
    const { router } = renderApp('/ideias/nova');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Título'), 'Relatório mais rápido');
    await usuario.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    expect(screen.getByText(TI.descricao)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Campo obrigatório.')).toBeInTheDocument();
    expect(recebidas.filter((r) => r.metodo === 'POST')).toHaveLength(0);

    await usuario.type(screen.getByLabelText('Situação atual *'), 'Leva 2 horas');
    await usuario.click(screen.getByRole('radio', { name: 'Sim' }));
    await usuario.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/ideias/7'));
    expect(recebidas.find((r) => r.metodo === 'POST')?.corpo).toEqual({
      titulo: 'Relatório mais rápido',
      categoriaId: TI.id,
      valores: { [CAMPOS[0]!.id]: 'Leva 2 horas', [CAMPOS[1]!.id]: true },
      publicar: true,
    });
  });

  it('salva como Rascunho mesmo sem os campos obrigatórios', async () => {
    simularAuth({ sessao: ana });
    const { recebidas } = simularIdeias();
    renderApp('/ideias/nova');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Título'), 'Ainda pensando');
    await usuario.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() =>
      expect(recebidas.find((r) => r.metodo === 'POST')?.corpo).toMatchObject({
        titulo: 'Ainda pensando',
        valores: {},
        publicar: false,
      }),
    );
  });
});

describe('página da Ideia', () => {
  it('Avaliador muda o Status com justificativa e o Histórico é atualizado', async () => {
    simularAuth({ sessao: ana });
    const { recebidas } = simularIdeias({
      ideia: ideiaDeExemplo({
        permissoes: {
          podeEditar: false,
          podeExcluir: false,
          podePublicar: false,
          podeCurtir: false,
          podeAvaliar: true,
          podeRecategorizar: false,
          transicoes: ['em_analise', 'duplicada', 'arquivada'],
        },
      }),
    });
    renderApp('/ideias/7');
    const usuario = userEvent.setup();

    expect(
      await screen.findByRole('heading', { name: 'Relatório mais rápido' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Leva 2 horas')).toBeInTheDocument();
    expect(screen.getByText('Ana Souza publicou a ideia')).toBeInTheDocument();

    const aplicar = screen.getByRole('button', { name: 'Aplicar' });
    await usuario.selectOptions(screen.getByLabelText('Novo status'), 'em_analise');
    expect(aplicar).toBeDisabled();
    await usuario.type(screen.getByLabelText('Justificativa'), 'Vamos medir o tempo');
    await usuario.click(aplicar);

    expect(await screen.findByText('Bruno mudou de Aberta para Em análise')).toBeInTheDocument();
    expect(recebidas.find((r) => r.url.pathname.endsWith('/status'))?.corpo).toEqual({
      para: 'em_analise',
      justificativa: 'Vamos medir o tempo',
    });
  });

  it('Colaborador sem papel não vê o painel de avaliação', async () => {
    simularAuth({ sessao: ana });
    simularIdeias();
    renderApp('/ideias/7');
    expect(
      await screen.findByRole('heading', { name: 'Relatório mais rápido' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Avaliação' })).not.toBeInTheDocument();
  });

  it('Duplicada mostra o caminho para a Ideia Original', async () => {
    simularAuth({ sessao: ana });
    simularIdeias({
      ideia: ideiaDeExemplo({
        status: 'duplicada',
        ideiaOriginal: { numero: 3, titulo: 'Relatórios agendados' },
      }),
    });
    renderApp('/ideias/7');
    const link = await screen.findByRole('link', { name: 'Ideia #3: Relatórios agendados' });
    expect(link).toHaveAttribute('href', '/ideias/3');
  });
});

describe('Curtidas', () => {
  const bruno = { ...ana, id: '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b', nome: 'Bruno Lima' };
  const carla = { id: '8b3e4c6a-2f9d-4b7a-9c73-5e4d3f2a1b0c', nome: 'Carla Dias' };

  it('colega curte, vê o contador subir e desfaz', async () => {
    simularAuth({ sessao: bruno });
    const { recebidas } = simularIdeias({
      ideia: ideiaDeExemplo({
        curtidas: { total: 1, curtiu: false },
        permissoes: { ...ideiaDeExemplo().permissoes, podeCurtir: true },
      }),
      curtidas: { eu: bruno, outras: [{ colaborador: carla, em: '2026-10-02T10:00:00.000Z' }] },
    });
    renderApp('/ideias/7');
    const usuario = userEvent.setup();

    const curtir = await screen.findByRole('button', { name: 'Curtir' });
    expect(curtir).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1 curtida')).toBeInTheDocument();

    await usuario.click(curtir);
    expect(await screen.findByRole('button', { name: 'Curtida' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('2 curtidas')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Ver quem curtiu' }));
    const quem = await screen.findByRole('list', { name: 'Ver quem curtiu' });
    expect(
      within(quem)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Bruno Lima', 'Carla Dias']);

    await usuario.click(screen.getByRole('button', { name: 'Curtida' }));
    expect(await screen.findByRole('button', { name: 'Curtir' })).toBeInTheDocument();
    expect(recebidas.map((r) => r.metodo)).toEqual(['PUT', 'DELETE']);
  });

  it('a Autora vê as Curtidas, mas não pode curtir a própria Ideia', async () => {
    simularAuth({ sessao: ana });
    simularIdeias({ ideia: ideiaDeExemplo({ curtidas: { total: 3, curtiu: false } }) });
    renderApp('/ideias/7');

    expect(await screen.findByText('Você não pode curtir a própria ideia.')).toBeInTheDocument();
    expect(screen.getByText('3 curtidas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Curtir' })).not.toBeInTheDocument();
  });

  it('em Ideia Concluída as Curtidas aparecem congeladas', async () => {
    simularAuth({ sessao: bruno });
    simularIdeias({
      ideia: ideiaDeExemplo({ status: 'concluida', curtidas: { total: 5, curtiu: true } }),
    });
    renderApp('/ideias/7');

    expect(
      await screen.findByText('As curtidas estão congeladas neste status.'),
    ).toBeInTheDocument();
    expect(screen.getByText('5 curtidas')).toBeInTheDocument();
  });
});

describe('lista de Ideias', () => {
  it('mostra as Ideias e guarda o filtro de Status na URL', async () => {
    simularAuth({ sessao: ana });
    const { recebidas } = simularIdeias();
    const { router } = renderApp('/');
    const usuario = userEvent.setup();

    expect(await screen.findByRole('link', { name: /Relatório mais rápido/ })).toHaveAttribute(
      'href',
      '/ideias/7',
    );
    await usuario.selectOptions(screen.getByLabelText('Status'), 'concluida');
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ status: 'concluida' }),
    );
    await waitFor(() =>
      expect(recebidas.some((r) => r.url.searchParams.get('status') === 'concluida')).toBe(true),
    );
  });

  it('ordena por Em alta por padrão e guarda outra ordenação na URL', async () => {
    simularAuth({ sessao: ana });
    const { recebidas } = simularIdeias({
      ideia: ideiaDeExemplo({ curtidas: { total: 4, curtiu: false } }),
    });
    const { router } = renderApp('/');
    const usuario = userEvent.setup();

    expect(await screen.findByText('4 curtidas')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('em_alta');

    await usuario.selectOptions(screen.getByLabelText('Ordenar por'), 'mais_curtidas');
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ ordem: 'mais_curtidas' }),
    );
    await waitFor(() =>
      expect(recebidas.some((r) => r.url.searchParams.get('ordem') === 'mais_curtidas')).toBe(true),
    );
  });
});
