/**
 * Regras do ciclo de vida da Ideia (PRD §3.2–3.3, ADR-0004). Código puro: sem NestJS nem banco,
 * para que as regras sejam testadas isoladamente e lidas num lugar só.
 */

export const STATUS = [
  'rascunho',
  'aberta',
  'em_analise',
  'aprovada',
  'em_execucao',
  'concluida',
  'recusada',
  'duplicada',
  'arquivada',
] as const;

export type Status = (typeof STATUS)[number];

/** Transições feitas por Avaliador ou Administrador. Rascunho → Aberta é a publicação, feita pelo Autor. */
const TRANSICOES: Record<Status, readonly Status[]> = {
  rascunho: [],
  aberta: ['em_analise', 'duplicada', 'arquivada'],
  em_analise: ['aprovada', 'recusada', 'duplicada', 'arquivada'],
  // Depois de aprovada não se arquiva: desistir é uma decisão de mérito (Recusada).
  aprovada: ['em_execucao', 'recusada'],
  em_execucao: ['concluida', 'recusada'],
  concluida: [],
  recusada: ['em_analise'],
  duplicada: [],
  arquivada: ['aberta'],
};

/** Status em que o Autor ainda pode editar o texto; a partir de Em análise, novidades vão em Comentários. */
const EDITAVEIS: readonly Status[] = ['rascunho', 'aberta'];

/** Status em que a Ideia recebe (e perde) Curtidas; nos demais elas ficam congeladas. */
const CURTIVEIS: readonly Status[] = ['aberta', 'em_analise', 'aprovada', 'em_execucao'];

/**
 * "Em alta": cada acontecimento (a publicação e cada Curtida) vale 1 e perde metade do peso a cada
 * meia-vida, para que o apoio recente pese mais que o antigo.
 */
export const MEIA_VIDA_EM_ALTA_DIAS = 7;

/** Ordenações da listagem; "Em alta" é a padrão. */
export const ORDENS = ['em_alta', 'mais_curtidas', 'mais_recentes'] as const;
export type Ordem = (typeof ORDENS)[number];

const RECATEGORIZAVEIS: readonly Status[] = [
  'aberta',
  'em_analise',
  'aprovada',
  'em_execucao',
  'recusada',
  'arquivada',
];

export type CodigoDeErro =
  | 'SEM_PERMISSAO'
  | 'TRANSICAO_INVALIDA'
  | 'JUSTIFICATIVA_OBRIGATORIA'
  | 'IDEIA_ORIGINAL_INVALIDA'
  | 'CAMPOS_INVALIDOS'
  | 'CURTIDA_INDISPONIVEL'
  | 'COMENTARIO_INDISPONIVEL';

export class ErroDeDominio extends Error {
  constructor(
    readonly codigo: CodigoDeErro,
    mensagem: string,
    readonly detalhes?: Record<string, string>,
  ) {
    super(mensagem);
  }
}

export interface IdeiaParaRegras {
  id?: string;
  status: Status;
  autorId: string;
}

export interface Ator {
  id: string;
  administrador: boolean;
  /** É Avaliador da Categoria da Ideia em questão. */
  avaliaCategoria: boolean;
}

const ehAutor = (ideia: IdeiaParaRegras, ator: Ator) => ideia.autorId === ator.id;

/** Administrador sempre; Avaliador da Categoria, exceto nas próprias Ideias (conflito de interesse). */
export function podeAvaliar(ideia: IdeiaParaRegras, ator: Ator) {
  return ator.administrador || (ator.avaliaCategoria && !ehAutor(ideia, ator));
}

export function exigirJustificativa(
  justificativa: string | undefined,
  mensagem = 'Informe a justificativa',
) {
  if (!justificativa?.trim()) throw new ErroDeDominio('JUSTIFICATIVA_OBRIGATORIA', mensagem);
}

export function validarMudancaDeStatus(
  ideia: IdeiaParaRegras,
  para: Status,
  ator: Ator,
  dados: { justificativa?: string; ideiaOriginal?: { id: string; status: Status } },
) {
  if (!podeAvaliar(ideia, ator)) {
    throw new ErroDeDominio(
      'SEM_PERMISSAO',
      'Só Avaliadores da Categoria ou Administradores mudam o Status',
    );
  }
  if (!TRANSICOES[ideia.status].includes(para)) {
    throw new ErroDeDominio(
      'TRANSICAO_INVALIDA',
      `Não é possível ir de ${ideia.status} para ${para}`,
    );
  }
  exigirJustificativa(dados.justificativa);

  if (para === 'duplicada') {
    const original = dados.ideiaOriginal;
    if (
      !original ||
      original.id === ideia.id ||
      original.status === 'rascunho' ||
      original.status === 'duplicada'
    ) {
      throw new ErroDeDominio(
        'IDEIA_ORIGINAL_INVALIDA',
        'Informe uma Ideia Original publicada, diferente desta e que não seja Duplicada',
      );
    }
  }
}

export function validarRecategorizacao(ideia: IdeiaParaRegras, ator: Ator, justificativa: string) {
  if (!podeAvaliar(ideia, ator)) {
    throw new ErroDeDominio(
      'SEM_PERMISSAO',
      'Só Avaliadores da Categoria ou Administradores recategorizam',
    );
  }
  if (!RECATEGORIZAVEIS.includes(ideia.status)) {
    throw new ErroDeDominio('TRANSICAO_INVALIDA', 'Esta Ideia não pode mais mudar de Categoria');
  }
  exigirJustificativa(justificativa);
}

export function validarEdicao(ideia: IdeiaParaRegras, ator: Ator) {
  if (!ehAutor(ideia, ator)) throw new ErroDeDominio('SEM_PERMISSAO', 'Só o Autor edita a Ideia');
  if (!EDITAVEIS.includes(ideia.status)) {
    throw new ErroDeDominio(
      'TRANSICAO_INVALIDA',
      'A Ideia já está em avaliação; acrescente informações nos Comentários',
    );
  }
}

export function validarPublicacao(ideia: IdeiaParaRegras, ator: Ator) {
  if (!ehAutor(ideia, ator)) throw new ErroDeDominio('SEM_PERMISSAO', 'Só o Autor publica a Ideia');
  if (ideia.status !== 'rascunho') {
    throw new ErroDeDominio('TRANSICAO_INVALIDA', 'A Ideia já foi publicada');
  }
}

export function validarExclusao(
  ideia: IdeiaParaRegras,
  ator: Ator,
  contexto: { temInteracaoDeOutros: boolean },
) {
  if (!ehAutor(ideia, ator)) throw new ErroDeDominio('SEM_PERMISSAO', 'Só o Autor exclui a Ideia');
  const permitida =
    ideia.status === 'rascunho' || (ideia.status === 'aberta' && !contexto.temInteracaoDeOutros);
  if (!permitida) {
    throw new ErroDeDominio(
      'TRANSICAO_INVALIDA',
      'Outras pessoas já interagiram com esta Ideia; peça o arquivamento num Comentário',
    );
  }
}

/** Vale para curtir e para desfazer a Curtida. */
export function validarCurtida(ideia: IdeiaParaRegras, ator: Ator) {
  if (ehAutor(ideia, ator)) {
    throw new ErroDeDominio('SEM_PERMISSAO', 'O Autor não curte a própria Ideia');
  }
  if (!CURTIVEIS.includes(ideia.status)) {
    throw new ErroDeDominio(
      'CURTIDA_INDISPONIVEL',
      'As Curtidas desta Ideia estão congeladas por causa do Status',
    );
  }
}

export function podeVer(ideia: IdeiaParaRegras, ator: Ator) {
  return ideia.status !== 'rascunho' || ehAutor(ideia, ator);
}

function permite(validacao: () => void) {
  try {
    validacao();
    return true;
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return false;
    throw erro;
  }
}

/** O que o Ator pode fazer com a Ideia, para a interface mostrar só as ações válidas. */
export function permissoes(
  ideia: IdeiaParaRegras,
  ator: Ator,
  contexto: { temInteracaoDeOutros: boolean },
) {
  const avalia = ideia.status !== 'rascunho' && podeAvaliar(ideia, ator);
  return {
    podeVer: podeVer(ideia, ator),
    podeEditar: permite(() => validarEdicao(ideia, ator)),
    podeExcluir: permite(() => validarExclusao(ideia, ator, contexto)),
    podePublicar: permite(() => validarPublicacao(ideia, ator)),
    podeCurtir: permite(() => validarCurtida(ideia, ator)),
    podeAvaliar: avalia,
    podeRecategorizar: avalia && RECATEGORIZAVEIS.includes(ideia.status),
    transicoes: avalia ? [...TRANSICOES[ideia.status]] : [],
  };
}
