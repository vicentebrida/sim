import { describe, expect, it } from 'vitest';
import {
  type Ator,
  ErroDeDominio,
  type IdeiaParaRegras,
  permissoes,
  validarExclusao,
  validarMudancaDeStatus,
  validarRecategorizacao,
} from './ideia';

const AUTOR = 'autor';
const ideia = (status: IdeiaParaRegras['status']): IdeiaParaRegras => ({ status, autorId: AUTOR });

const autor: Ator = { id: AUTOR, administrador: false, avaliaCategoria: false };
const colega: Ator = { id: 'colega', administrador: false, avaliaCategoria: false };
const avaliador: Ator = { id: 'avaliador', administrador: false, avaliaCategoria: true };
const administrador: Ator = { id: 'admin', administrador: true, avaliaCategoria: false };

function codigoDoErro(acao: () => void) {
  try {
    acao();
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return erro.codigo;
    throw erro;
  }
  return undefined;
}

describe('mudança de Status', () => {
  const comJustificativa = { justificativa: 'Avaliado pelo comitê' };

  it.each([
    ['aberta', 'em_analise'],
    ['aberta', 'arquivada'],
    ['em_analise', 'aprovada'],
    ['em_analise', 'recusada'],
    ['em_analise', 'arquivada'],
    ['aprovada', 'em_execucao'],
    ['aprovada', 'recusada'],
    ['em_execucao', 'concluida'],
    ['em_execucao', 'recusada'],
    ['recusada', 'em_analise'],
    ['arquivada', 'aberta'],
  ] as const)('Avaliador leva de %s para %s', (de, para) => {
    expect(() =>
      validarMudancaDeStatus(ideia(de), para, avaliador, comJustificativa),
    ).not.toThrow();
  });

  it.each([
    ['aberta', 'aprovada'],
    ['aberta', 'recusada'],
    ['aprovada', 'arquivada'],
    ['concluida', 'em_execucao'],
    ['duplicada', 'aberta'],
    ['rascunho', 'em_analise'],
    ['arquivada', 'em_analise'],
  ] as const)('não permite ir de %s para %s', (de, para) => {
    expect(
      codigoDoErro(() => validarMudancaDeStatus(ideia(de), para, avaliador, comJustificativa)),
    ).toBe('TRANSICAO_INVALIDA');
  });

  it('exige justificativa', () => {
    expect(
      codigoDoErro(() =>
        validarMudancaDeStatus(ideia('aberta'), 'em_analise', avaliador, { justificativa: '  ' }),
      ),
    ).toBe('JUSTIFICATIVA_OBRIGATORIA');
  });

  it('só Avaliador da Categoria ou Administrador muda o Status', () => {
    expect(
      codigoDoErro(() =>
        validarMudancaDeStatus(ideia('aberta'), 'em_analise', colega, comJustificativa),
      ),
    ).toBe('SEM_PERMISSAO');
    expect(
      codigoDoErro(() =>
        validarMudancaDeStatus(ideia('aberta'), 'em_analise', autor, comJustificativa),
      ),
    ).toBe('SEM_PERMISSAO');
    expect(() =>
      validarMudancaDeStatus(ideia('aberta'), 'em_analise', administrador, comJustificativa),
    ).not.toThrow();
  });

  it('Avaliador não avalia a própria Ideia', () => {
    const autorQueAvalia: Ator = { ...avaliador, id: AUTOR };
    expect(
      codigoDoErro(() =>
        validarMudancaDeStatus(ideia('aberta'), 'em_analise', autorQueAvalia, comJustificativa),
      ),
    ).toBe('SEM_PERMISSAO');
  });

  it('Administrador, como último recurso, pode avaliar a própria Ideia', () => {
    const adminAutor: Ator = { ...administrador, id: AUTOR };
    expect(() =>
      validarMudancaDeStatus(ideia('aberta'), 'em_analise', adminAutor, comJustificativa),
    ).not.toThrow();
  });

  describe('Duplicada', () => {
    it('pode vir de Aberta ou Em análise e exige a Ideia Original', () => {
      for (const de of ['aberta', 'em_analise'] as const) {
        expect(() =>
          validarMudancaDeStatus(ideia(de), 'duplicada', avaliador, {
            ...comJustificativa,
            ideiaOriginal: { id: 'outra', status: 'aberta' },
          }),
        ).not.toThrow();
      }
      expect(
        codigoDoErro(() =>
          validarMudancaDeStatus(ideia('aberta'), 'duplicada', avaliador, comJustificativa),
        ),
      ).toBe('IDEIA_ORIGINAL_INVALIDA');
    });

    it('a Ideia Original não pode ser ela mesma, um Rascunho nem outra Duplicada', () => {
      const alvo = { ...ideia('aberta'), id: 'esta' };
      for (const ideiaOriginal of [
        { id: 'esta', status: 'aberta' as const },
        { id: 'outra', status: 'rascunho' as const },
        { id: 'outra', status: 'duplicada' as const },
      ]) {
        expect(
          codigoDoErro(() =>
            validarMudancaDeStatus(alvo, 'duplicada', avaliador, {
              ...comJustificativa,
              ideiaOriginal,
            }),
          ),
        ).toBe('IDEIA_ORIGINAL_INVALIDA');
      }
    });
  });
});

describe('recategorização', () => {
  it('Avaliador ou Administrador recategoriza Ideias publicadas e não encerradas, com justificativa', () => {
    for (const status of [
      'aberta',
      'em_analise',
      'aprovada',
      'em_execucao',
      'recusada',
      'arquivada',
    ] as const) {
      expect(() =>
        validarRecategorizacao(ideia(status), avaliador, 'Era de Processos'),
      ).not.toThrow();
    }
    expect(codigoDoErro(() => validarRecategorizacao(ideia('concluida'), avaliador, 'x'))).toBe(
      'TRANSICAO_INVALIDA',
    );
    expect(codigoDoErro(() => validarRecategorizacao(ideia('aberta'), avaliador, ''))).toBe(
      'JUSTIFICATIVA_OBRIGATORIA',
    );
    expect(codigoDoErro(() => validarRecategorizacao(ideia('aberta'), colega, 'x'))).toBe(
      'SEM_PERMISSAO',
    );
  });
});

describe('exclusão pelo Autor', () => {
  it('Rascunho pode ser excluído sempre', () => {
    expect(() =>
      validarExclusao(ideia('rascunho'), autor, { temInteracaoDeOutros: true }),
    ).not.toThrow();
  });

  it('Aberta só pode ser excluída se ninguém mais interagiu', () => {
    expect(() =>
      validarExclusao(ideia('aberta'), autor, { temInteracaoDeOutros: false }),
    ).not.toThrow();
    expect(
      codigoDoErro(() => validarExclusao(ideia('aberta'), autor, { temInteracaoDeOutros: true })),
    ).toBe('TRANSICAO_INVALIDA');
  });

  it('a partir de Em análise não pode ser excluída', () => {
    expect(
      codigoDoErro(() =>
        validarExclusao(ideia('em_analise'), autor, { temInteracaoDeOutros: false }),
      ),
    ).toBe('TRANSICAO_INVALIDA');
  });

  it('só o Autor exclui', () => {
    expect(
      codigoDoErro(() =>
        validarExclusao(ideia('rascunho'), administrador, { temInteracaoDeOutros: false }),
      ),
    ).toBe('SEM_PERMISSAO');
  });
});

describe('permissões calculadas para a tela', () => {
  it('Autor de uma Ideia Aberta pode editar e excluir, mas não avaliar', () => {
    expect(permissoes(ideia('aberta'), autor, { temInteracaoDeOutros: false })).toEqual({
      podeVer: true,
      podeEditar: true,
      podeExcluir: true,
      podePublicar: false,
      podeAvaliar: false,
      podeRecategorizar: false,
      transicoes: [],
    });
  });

  it('a partir de Em análise o texto fica travado para o Autor', () => {
    expect(permissoes(ideia('em_analise'), autor, { temInteracaoDeOutros: false }).podeEditar).toBe(
      false,
    );
  });

  it('Rascunho é visível só para o Autor', () => {
    expect(permissoes(ideia('rascunho'), autor, { temInteracaoDeOutros: false })).toMatchObject({
      podeVer: true,
      podePublicar: true,
    });
    expect(
      permissoes(ideia('rascunho'), administrador, { temInteracaoDeOutros: false }).podeVer,
    ).toBe(false);
  });

  it('Avaliador vê as transições possíveis a partir do Status atual', () => {
    expect(
      permissoes(ideia('em_analise'), avaliador, { temInteracaoDeOutros: false }).transicoes,
    ).toEqual(['aprovada', 'recusada', 'duplicada', 'arquivada']);
  });
});
