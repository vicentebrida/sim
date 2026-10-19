import { ErroDeDominio } from './ideia';

export const TIPOS_DE_CAMPO = [
  'texto_curto',
  'texto_longo',
  'selecao_unica',
  'selecao_multipla',
  'numero',
  'sim_nao',
] as const;

export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number];

export type ValorDeCampo = string | number | boolean | string[] | null;
export type Valores = Record<string, ValorDeCampo>;

export interface DefinicaoDeCampo {
  id: string;
  rotulo: string;
  tipo: TipoDeCampo;
  obrigatorio: boolean;
  opcoes: string[];
  ativo: boolean;
}

const LIMITE_TEXTO: Partial<Record<TipoDeCampo, number>> = {
  texto_curto: 200,
  texto_longo: 10_000,
};

function vazio(valor: ValorDeCampo | undefined) {
  return (
    valor === null ||
    valor === undefined ||
    (typeof valor === 'string' && !valor.trim()) ||
    (Array.isArray(valor) && valor.length === 0)
  );
}

/** Devolve o valor normalizado, ou a mensagem de erro. */
function validar(
  campo: DefinicaoDeCampo,
  valor: ValorDeCampo,
): { valor: ValorDeCampo } | { erro: string } {
  switch (campo.tipo) {
    case 'texto_curto':
    case 'texto_longo': {
      if (typeof valor !== 'string') return { erro: 'Informe um texto' };
      const texto = valor.trim();
      const limite = LIMITE_TEXTO[campo.tipo]!;
      return texto.length > limite ? { erro: `Máximo de ${limite} caracteres` } : { valor: texto };
    }
    case 'selecao_unica':
      return typeof valor === 'string' && campo.opcoes.includes(valor)
        ? { valor }
        : { erro: 'Opção inválida' };
    case 'selecao_multipla':
      return Array.isArray(valor) &&
        new Set(valor).size === valor.length &&
        valor.every((opcao) => campo.opcoes.includes(opcao))
        ? { valor }
        : { erro: 'Opções inválidas' };
    case 'numero':
      return typeof valor === 'number' && Number.isFinite(valor)
        ? { valor }
        : { erro: 'Informe um número' };
    case 'sim_nao':
      return typeof valor === 'boolean' ? { valor } : { erro: 'Informe sim ou não' };
  }
}

/**
 * Valida e normaliza os valores enviados para os Campos Personalizados de uma Ideia.
 *
 * - Só campos ativos podem receber valores; valores já gravados em campos desativados são
 *   preservados (o campo some do formulário, mas continua na Ideia).
 * - Obrigatoriedade só é exigida na publicação: um Rascunho pode estar incompleto, e um campo
 *   obrigatório criado depois não invalida Ideias antigas.
 */
export function normalizarValores(
  campos: DefinicaoDeCampo[],
  enviados: Valores,
  existentes: Valores,
  opcoes: { exigirObrigatorios: boolean },
): Valores {
  const porId = new Map(campos.map((campo) => [campo.id, campo]));
  const erros: Record<string, string> = {};
  const resultado: Valores = {};

  for (const [id, valor] of Object.entries(existentes)) {
    if (porId.get(id)?.ativo === false) resultado[id] = valor;
  }

  for (const [id, valor] of Object.entries(enviados)) {
    const campo = porId.get(id);
    if (!campo?.ativo) {
      erros[id] = 'Campo inexistente ou desativado';
      continue;
    }
    if (vazio(valor)) continue;
    const validado = validar(campo, valor);
    if ('erro' in validado) erros[id] = validado.erro;
    else if (!vazio(validado.valor)) resultado[id] = validado.valor;
  }

  if (opcoes.exigirObrigatorios) {
    for (const campo of campos) {
      if (campo.ativo && campo.obrigatorio && !(campo.id in resultado) && !erros[campo.id]) {
        erros[campo.id] = 'Campo obrigatório';
      }
    }
  }

  if (Object.keys(erros).length) {
    throw new ErroDeDominio('CAMPOS_INVALIDOS', 'Há campos inválidos', erros);
  }
  return resultado;
}
