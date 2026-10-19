import type {
  CampoPersonalizadoDtoOutput,
  CategoriaDtoOutput,
  CurtidaDtoOutput,
  IdeiaDtoOutput,
} from '@sim/api-client';
import { http, HttpResponse } from 'msw';
import { ana } from './api';
import { server } from './server';

export const TI: CategoriaDtoOutput = {
  id: '11111111-1111-4111-8111-111111111111',
  nome: 'TI',
  descricao: 'Sistemas, equipamentos e acessos',
  ativa: true,
  avaliadores: [],
};

export const CAMPOS: CampoPersonalizadoDtoOutput[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    rotulo: 'Situação atual',
    ajuda: 'Como é hoje?',
    tipo: 'texto_longo',
    obrigatorio: true,
    opcoes: [],
    usarNaDeteccao: true,
    ordem: 1,
    ativo: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    rotulo: 'Urgente',
    ajuda: '',
    tipo: 'sim_nao',
    obrigatorio: false,
    opcoes: [],
    usarNaDeteccao: false,
    ordem: 2,
    ativo: true,
  },
];

export function ideiaDeExemplo(parcial: Partial<IdeiaDtoOutput> = {}): IdeiaDtoOutput {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    numero: 7,
    titulo: 'Relatório mais rápido',
    status: 'aberta',
    categoria: { id: TI.id, nome: TI.nome },
    autor: { id: ana.id, nome: ana.nome },
    curtidas: { total: 0, curtiu: false },
    criadaEm: '2026-10-01T12:00:00.000Z',
    publicadaEm: '2026-10-01T12:00:00.000Z',
    editadaEm: null,
    valores: { [CAMPOS[0]!.id]: 'Leva 2 horas' },
    respostas: [
      {
        campoId: CAMPOS[0]!.id,
        rotulo: 'Situação atual',
        tipo: 'texto_longo',
        valor: 'Leva 2 horas',
      },
    ],
    ideiaOriginal: null,
    historico: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        tipo: 'status',
        de: null,
        para: 'aberta',
        justificativa: null,
        colaborador: { id: ana.id, nome: ana.nome },
        em: '2026-10-01T12:00:00.000Z',
      },
    ],
    permissoes: {
      podeEditar: false,
      podeExcluir: false,
      podePublicar: false,
      podeCurtir: false,
      podeAvaliar: false,
      podeRecategorizar: false,
      transicoes: [],
    },
    ...parcial,
  };
}

/** API de Ideias simulada; devolve as requisições recebidas para os testes inspecionarem. */
export function simularIdeias(
  opcoes: {
    ideia?: IdeiaDtoOutput;
    /** Quem curte nesta simulação (o Colaborador da sessão) e quem já tinha curtido. */
    curtidas?: { eu: CurtidaDtoOutput['colaborador']; outras?: CurtidaDtoOutput[] };
  } = {},
) {
  let ideia = opcoes.ideia ?? ideiaDeExemplo();
  let curtidas = opcoes.curtidas?.outras ?? [];
  const alterarCurtida = (curtiu: boolean) => {
    const eu = opcoes.curtidas?.eu;
    if (!eu) throw new Error('Informe `curtidas.eu` para simular Curtidas');
    curtidas = curtidas.filter((c) => c.colaborador.id !== eu.id);
    if (curtiu) curtidas = [{ colaborador: eu, em: '2026-10-03T10:00:00.000Z' }, ...curtidas];
    ideia = { ...ideia, curtidas: { total: curtidas.length, curtiu } };
    return HttpResponse.json(ideia.curtidas);
  };
  const recebidas: { metodo: string; url: URL; corpo?: unknown }[] = [];
  const registrar = async (request: Request) => {
    const corpo =
      request.method === 'GET'
        ? undefined
        : await request
            .clone()
            .json()
            .catch(() => undefined);
    recebidas.push({ metodo: request.method, url: new URL(request.url), corpo });
  };

  server.use(
    http.get('*/api/categorias', () => HttpResponse.json([TI])),
    http.get('*/api/campos-personalizados', () => HttpResponse.json(CAMPOS)),
    http.get('*/api/ideias', async ({ request }) => {
      await registrar(request);
      const {
        valores: _v,
        respostas: _r,
        historico: _h,
        permissoes: _p,
        ideiaOriginal: _o,
        editadaEm: _e,
        ...resumo
      } = ideia;
      return HttpResponse.json({ itens: [resumo], total: 1, pagina: 1, porPagina: 20 });
    }),
    http.post('*/api/ideias', async ({ request }) => {
      await registrar(request);
      const corpo = (await request.json()) as { titulo: string; publicar: boolean };
      ideia = { ...ideia, titulo: corpo.titulo, status: corpo.publicar ? 'aberta' : 'rascunho' };
      return HttpResponse.json(ideia, { status: 201 });
    }),
    http.get('*/api/ideias/:numero', () => HttpResponse.json(ideia)),
    http.get('*/api/ideias/:numero/curtidas', () => HttpResponse.json(curtidas)),
    http.put('*/api/ideias/:numero/curtida', async ({ request }) => {
      await registrar(request);
      return alterarCurtida(true);
    }),
    http.delete('*/api/ideias/:numero/curtida', async ({ request }) => {
      await registrar(request);
      return alterarCurtida(false);
    }),
    http.post('*/api/ideias/:numero/status', async ({ request }) => {
      await registrar(request);
      const corpo = (await request.json()) as {
        para: IdeiaDtoOutput['status'];
        justificativa: string;
      };
      ideia = {
        ...ideia,
        status: corpo.para,
        historico: [
          ...ideia.historico,
          {
            id: '66666666-6666-4666-8666-666666666666',
            tipo: 'status',
            de: ideia.status,
            para: corpo.para,
            justificativa: corpo.justificativa,
            colaborador: { id: 'avaliador', nome: 'Bruno' },
            em: '2026-10-02T09:00:00.000Z',
          },
        ],
        permissoes: { ...ideia.permissoes, transicoes: [] },
      };
      return HttpResponse.json(ideia);
    }),
  );
  return { recebidas };
}
