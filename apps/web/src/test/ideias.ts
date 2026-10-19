import type {
  CampoPersonalizadoDtoOutput,
  CategoriaDtoOutput,
  ComentarioDtoOutput,
  ComentarioDtoOutputRespostasItem,
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

export const BRUNO = { id: '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b', nome: 'Bruno Lima' };

export function comentarioDeExemplo(
  parcial: Partial<ComentarioDtoOutput> = {},
): ComentarioDtoOutput {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    autor: BRUNO,
    texto: 'Comentário de exemplo',
    estado: 'publicado',
    criadoEm: '2026-10-02T10:00:00.000Z',
    editadoEm: null,
    ocultacao: null,
    permissoes: { podeResponder: true, podeEditar: false, podeRemover: false, podeOcultar: false },
    respostas: [],
    ...parcial,
  };
}

/** API de Ideias simulada; devolve as requisições recebidas para os testes inspecionarem. */
export function simularIdeias(
  opcoes: {
    ideia?: IdeiaDtoOutput;
    /** Quem curte nesta simulação (o Colaborador da sessão) e quem já tinha curtido. */
    curtidas?: { eu: CurtidaDtoOutput['colaborador']; outras?: CurtidaDtoOutput[] };
    comentarios?: ComentarioDtoOutput[];
    /** Quem comenta nesta simulação (o Colaborador da sessão). */
    eu?: { id: string; nome: string };
    mencionaveis?: { id: string; nome: string }[];
  } = {},
) {
  let comentarios = opcoes.comentarios ?? [];
  let sequencia = 0;
  type Mudanca = (
    comentario: ComentarioDtoOutputRespostasItem,
  ) => Partial<ComentarioDtoOutputRespostasItem>;
  // Vale para Comentários e Respostas.
  const alterarComentario = (id: string, mudanca: Mudanca) => {
    comentarios = comentarios.map((c) => ({
      ...c,
      ...(c.id === id ? mudanca(c) : {}),
      respostas: c.respostas.map((r) => (r.id === id ? { ...r, ...mudanca(r) } : r)),
    }));
  };
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
    http.get('*/api/ideias/:numero/comentarios', () => HttpResponse.json(comentarios)),
    http.post('*/api/ideias/:numero/comentarios', async ({ request }) => {
      await registrar(request);
      const corpo = (await request.json()) as { texto: string; respostaAId?: string };
      sequencia += 1;
      const novo = comentarioDeExemplo({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(sequencia).padStart(12, '0')}`,
        autor: opcoes.eu ?? { id: ana.id, nome: ana.nome },
        texto: corpo.texto,
        criadoEm: `2026-10-05T10:00:0${sequencia}.000Z`,
        permissoes: {
          podeResponder: !corpo.respostaAId,
          podeEditar: true,
          podeRemover: true,
          podeOcultar: false,
        },
      });
      comentarios = corpo.respostaAId
        ? comentarios.map((c) =>
            c.id === corpo.respostaAId ? { ...c, respostas: [...c.respostas, novo] } : c,
          )
        : [...comentarios, novo];
      return HttpResponse.json(novo, { status: 201 });
    }),
    http.post('*/api/comentarios/:id/ocultar', async ({ request, params }) => {
      await registrar(request);
      const { motivo } = (await request.json()) as { motivo: string };
      alterarComentario(String(params.id), (c) => ({
        estado: 'oculto',
        ocultacao: { motivo, por: opcoes.eu ?? BRUNO, em: '2026-10-06T10:00:00.000Z' },
        permissoes: { ...c.permissoes, podeOcultar: false, podeResponder: false },
      }));
      return HttpResponse.json(comentarios[0]);
    }),
    http.delete('*/api/comentarios/:id', async ({ request, params }) => {
      await registrar(request);
      alterarComentario(String(params.id), () => ({
        estado: 'removido',
        texto: null,
        permissoes: {
          podeResponder: false,
          podeEditar: false,
          podeRemover: false,
          podeOcultar: false,
        },
      }));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('*/api/colaboradores/mencionaveis', ({ request }) => {
      const busca = new URL(request.url).searchParams.get('busca')?.toLowerCase() ?? '';
      return HttpResponse.json(
        (opcoes.mencionaveis ?? []).filter((p) => p.nome.toLowerCase().includes(busca)),
      );
    }),
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
