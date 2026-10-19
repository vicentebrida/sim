import { describe, expect, it } from 'vitest';
import { type Ator, ErroDeDominio, type IdeiaParaRegras } from '../../ideias/dominio/ideia';
import {
  type ComentarioParaRegras,
  permissoesDoComentario,
  podeLerTexto,
  validarEdicaoDeComentario,
  validarNovoComentario,
  validarOcultacao,
  validarRemocaoDeComentario,
} from './comentario';

const ideia = (status: IdeiaParaRegras['status'] = 'aberta'): IdeiaParaRegras => ({
  status,
  autorId: 'autor-da-ideia',
});

const quemComenta: Ator = { id: 'quem-comenta', administrador: false, avaliaCategoria: false };
const colega: Ator = { id: 'colega', administrador: false, avaliaCategoria: false };
const avaliador: Ator = { id: 'avaliador', administrador: false, avaliaCategoria: true };
const administrador: Ator = { id: 'admin', administrador: true, avaliaCategoria: false };
const autorDaIdeiaAvaliador: Ator = {
  id: 'autor-da-ideia',
  administrador: false,
  avaliaCategoria: true,
};

const comentario = (parcial: Partial<ComentarioParaRegras> = {}): ComentarioParaRegras => ({
  autorId: quemComenta.id,
  respostaAId: null,
  removido: false,
  oculto: false,
  ...parcial,
});

function codigoDoErro(acao: () => void) {
  try {
    acao();
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return erro.codigo;
    throw erro;
  }
  return undefined;
}

describe('novo Comentário', () => {
  it('vale em qualquer Status publicado, inclusive Recusada e Arquivada', () => {
    for (const status of ['aberta', 'concluida', 'recusada', 'arquivada', 'duplicada'] as const) {
      expect(codigoDoErro(() => validarNovoComentario(ideia(status)))).toBeUndefined();
    }
    expect(codigoDoErro(() => validarNovoComentario(ideia('rascunho')))).toBe(
      'COMENTARIO_INDISPONIVEL',
    );
  });

  it('Resposta tem um nível só', () => {
    expect(codigoDoErro(() => validarNovoComentario(ideia(), comentario()))).toBeUndefined();
    expect(
      codigoDoErro(() => validarNovoComentario(ideia(), comentario({ respostaAId: 'outro' }))),
    ).toBe('COMENTARIO_INDISPONIVEL');
  });

  it('não se responde Comentário removido ou oculto', () => {
    for (const estado of [{ removido: true }, { oculto: true }]) {
      expect(codigoDoErro(() => validarNovoComentario(ideia(), comentario(estado)))).toBe(
        'COMENTARIO_INDISPONIVEL',
      );
    }
  });
});

describe('edição e remoção pelo autor do Comentário', () => {
  it('só quem escreveu edita e remove', () => {
    expect(
      codigoDoErro(() => validarEdicaoDeComentario(comentario(), quemComenta)),
    ).toBeUndefined();
    expect(
      codigoDoErro(() => validarRemocaoDeComentario(comentario(), quemComenta)),
    ).toBeUndefined();
    for (const ator of [colega, administrador]) {
      expect(codigoDoErro(() => validarEdicaoDeComentario(comentario(), ator))).toBe(
        'SEM_PERMISSAO',
      );
      expect(codigoDoErro(() => validarRemocaoDeComentario(comentario(), ator))).toBe(
        'SEM_PERMISSAO',
      );
    }
  });

  it('Comentário oculto não é editado, mas quem escreveu ainda pode removê-lo', () => {
    const oculto = comentario({ oculto: true });
    expect(codigoDoErro(() => validarEdicaoDeComentario(oculto, quemComenta))).toBe(
      'COMENTARIO_INDISPONIVEL',
    );
    expect(codigoDoErro(() => validarRemocaoDeComentario(oculto, quemComenta))).toBeUndefined();
  });

  it('Comentário removido não volta a ser editado nem removido', () => {
    const removido = comentario({ removido: true });
    expect(codigoDoErro(() => validarEdicaoDeComentario(removido, quemComenta))).toBe(
      'COMENTARIO_INDISPONIVEL',
    );
    expect(codigoDoErro(() => validarRemocaoDeComentario(removido, quemComenta))).toBe(
      'COMENTARIO_INDISPONIVEL',
    );
  });
});

describe('ocultação', () => {
  it('Avaliador da Categoria ou Administrador oculta, com motivo', () => {
    for (const ator of [avaliador, administrador]) {
      expect(
        codigoDoErro(() => validarOcultacao(comentario(), ideia(), ator, 'Ofensivo')),
      ).toBeUndefined();
    }
    expect(codigoDoErro(() => validarOcultacao(comentario(), ideia(), avaliador, ' '))).toBe(
      'JUSTIFICATIVA_OBRIGATORIA',
    );
  });

  it('colegas não ocultam, nem o Avaliador na própria Ideia', () => {
    expect(codigoDoErro(() => validarOcultacao(comentario(), ideia(), colega, 'x'))).toBe(
      'SEM_PERMISSAO',
    );
    expect(
      codigoDoErro(() => validarOcultacao(comentario(), ideia(), autorDaIdeiaAvaliador, 'x')),
    ).toBe('SEM_PERMISSAO');
  });

  it('texto oculto fica visível só para quem escreveu e para quem modera', () => {
    const oculto = comentario({ oculto: true });
    expect(podeLerTexto(oculto, ideia(), quemComenta)).toBe(true);
    expect(podeLerTexto(oculto, ideia(), avaliador)).toBe(true);
    expect(podeLerTexto(oculto, ideia(), colega)).toBe(false);
    expect(podeLerTexto(comentario({ removido: true }), ideia(), quemComenta)).toBe(false);
  });
});

describe('permissões calculadas para a tela', () => {
  it('quem escreveu edita, remove e responde; quem modera também oculta', () => {
    expect(permissoesDoComentario(comentario(), ideia(), quemComenta)).toEqual({
      podeResponder: true,
      podeEditar: true,
      podeRemover: true,
      podeOcultar: false,
    });
    expect(permissoesDoComentario(comentario(), ideia(), avaliador)).toEqual({
      podeResponder: true,
      podeEditar: false,
      podeRemover: false,
      podeOcultar: true,
    });
  });

  it('Resposta não oferece responder', () => {
    expect(
      permissoesDoComentario(comentario({ respostaAId: 'pai' }), ideia(), colega).podeResponder,
    ).toBe(false);
  });
});
