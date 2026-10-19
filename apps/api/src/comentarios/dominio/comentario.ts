/**
 * Regras dos Comentários (PRD §3.6). Como as da Ideia, é código puro, testado isoladamente.
 */
import {
  type Ator,
  ErroDeDominio,
  exigirJustificativa,
  type IdeiaParaRegras,
  podeAvaliar,
} from '../../ideias/dominio/ideia';

export interface ComentarioParaRegras {
  autorId: string;
  /** Comentário respondido; nulo quando o Comentário não é uma Resposta. */
  respostaAId: string | null;
  removido: boolean;
  oculto: boolean;
}

const ehAutor = (comentario: ComentarioParaRegras, ator: Ator) => comentario.autorId === ator.id;

const indisponivel = (mensagem: string) => new ErroDeDominio('COMENTARIO_INDISPONIVEL', mensagem);

/** Dá pra comentar em qualquer Status publicado, inclusive Recusada e Arquivada. */
export function validarNovoComentario(ideia: IdeiaParaRegras, respondido?: ComentarioParaRegras) {
  if (ideia.status === 'rascunho') throw indisponivel('Rascunhos não recebem Comentários');
  if (!respondido) return;
  if (respondido.respostaAId) {
    throw indisponivel('Respostas não podem ser respondidas; responda o Comentário original');
  }
  if (respondido.removido || respondido.oculto) {
    throw indisponivel('Este Comentário não está mais disponível para Respostas');
  }
}

export function validarEdicaoDeComentario(comentario: ComentarioParaRegras, ator: Ator) {
  if (!ehAutor(comentario, ator)) {
    throw new ErroDeDominio('SEM_PERMISSAO', 'Só quem escreveu edita o Comentário');
  }
  if (comentario.removido || comentario.oculto) {
    throw indisponivel('Comentário removido ou oculto não pode ser editado');
  }
}

export function validarRemocaoDeComentario(comentario: ComentarioParaRegras, ator: Ator) {
  if (!ehAutor(comentario, ator)) {
    throw new ErroDeDominio('SEM_PERMISSAO', 'Só quem escreveu remove o Comentário');
  }
  if (comentario.removido) throw indisponivel('O Comentário já foi removido');
}

/** Moderação: os mesmos que avaliam a Ideia (Avaliador da Categoria, exceto o Autor, ou Administrador). */
export function validarOcultacao(
  comentario: ComentarioParaRegras,
  ideia: IdeiaParaRegras,
  ator: Ator,
  motivo: string | undefined,
) {
  if (!podeAvaliar(ideia, ator)) {
    throw new ErroDeDominio(
      'SEM_PERMISSAO',
      'Só Avaliadores da Categoria ou Administradores ocultam Comentários',
    );
  }
  if (comentario.removido || comentario.oculto) {
    throw indisponivel('O Comentário já foi removido ou ocultado');
  }
  exigirJustificativa(motivo, 'Informe o motivo');
}

/**
 * Removido: ninguém vê o texto. Oculto: só quem escreveu e quem modera, para que a moderação possa
 * ser conferida; os demais veem apenas o motivo.
 */
export function podeLerTexto(comentario: ComentarioParaRegras, ideia: IdeiaParaRegras, ator: Ator) {
  if (comentario.removido) return false;
  if (!comentario.oculto) return true;
  return ehAutor(comentario, ator) || podeAvaliar(ideia, ator);
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

export function permissoesDoComentario(
  comentario: ComentarioParaRegras,
  ideia: IdeiaParaRegras,
  ator: Ator,
) {
  return {
    podeResponder: permite(() => validarNovoComentario(ideia, comentario)),
    podeEditar: permite(() => validarEdicaoDeComentario(comentario, ator)),
    podeRemover: permite(() => validarRemocaoDeComentario(comentario, ator)),
    podeOcultar: permite(() => validarOcultacao(comentario, ideia, ator, 'motivo')),
  };
}
