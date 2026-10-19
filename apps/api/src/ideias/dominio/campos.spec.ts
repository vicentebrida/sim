import { describe, expect, it } from 'vitest';
import { type DefinicaoDeCampo, normalizarValores } from './campos';
import { ErroDeDominio } from './ideia';

const campo = (parcial: Partial<DefinicaoDeCampo> & Pick<DefinicaoDeCampo, 'id' | 'tipo'>) =>
  ({
    rotulo: parcial.id,
    obrigatorio: false,
    opcoes: [],
    ativo: true,
    ...parcial,
  }) as DefinicaoDeCampo;

const situacao = campo({ id: 'situacao', tipo: 'texto_longo', obrigatorio: true });
const area = campo({ id: 'area', tipo: 'selecao_unica', opcoes: ['Fábrica', 'Escritório'] });
const sistemas = campo({ id: 'sistemas', tipo: 'selecao_multipla', opcoes: ['ERP', 'CRM', 'BI'] });
const economia = campo({ id: 'economia', tipo: 'numero' });
const urgente = campo({ id: 'urgente', tipo: 'sim_nao', obrigatorio: true });
const codigo = campo({ id: 'codigo', tipo: 'texto_curto' });
const antigo = campo({ id: 'antigo', tipo: 'texto_curto', ativo: false, obrigatorio: true });
const campos = [situacao, area, sistemas, economia, urgente, codigo, antigo];

function erros(acao: () => unknown) {
  try {
    acao();
  } catch (erro) {
    if (erro instanceof ErroDeDominio && erro.codigo === 'CAMPOS_INVALIDOS') return erro.detalhes;
    throw erro;
  }
  return undefined;
}

describe('valores dos Campos Personalizados', () => {
  it('aceita valores válidos de todos os tipos e descarta os vazios', () => {
    const valores = normalizarValores(
      campos,
      {
        situacao: '  O relatório demora 2h  ',
        area: 'Fábrica',
        sistemas: ['ERP', 'BI'],
        economia: 1500.5,
        urgente: false,
        codigo: '',
      },
      {},
      { exigirObrigatorios: true },
    );
    expect(valores).toEqual({
      situacao: 'O relatório demora 2h',
      area: 'Fábrica',
      sistemas: ['ERP', 'BI'],
      economia: 1500.5,
      urgente: false,
    });
  });

  it('aponta cada campo inválido', () => {
    expect(
      erros(() =>
        normalizarValores(
          campos,
          {
            area: 'Outra',
            sistemas: ['ERP', 'ERP'],
            economia: 'muito',
            urgente: 'sim',
            codigo: 'x'.repeat(201),
          },
          {},
          { exigirObrigatorios: false },
        ),
      ),
    ).toEqual({
      area: 'Opção inválida',
      sistemas: 'Opções inválidas',
      economia: 'Informe um número',
      urgente: 'Informe sim ou não',
      codigo: 'Máximo de 200 caracteres',
    });
  });

  it('recusa campos inexistentes ou desativados', () => {
    expect(
      erros(() =>
        normalizarValores(
          campos,
          { fantasma: 'x', antigo: 'y' },
          {},
          { exigirObrigatorios: false },
        ),
      ),
    ).toEqual({
      fantasma: 'Campo inexistente ou desativado',
      antigo: 'Campo inexistente ou desativado',
    });
  });

  it('exige os obrigatórios só quando pedido (publicação), e não os desativados', () => {
    expect(normalizarValores(campos, {}, {}, { exigirObrigatorios: false })).toEqual({});
    expect(
      erros(() => normalizarValores(campos, { situacao: ' ' }, {}, { exigirObrigatorios: true })),
    ).toEqual({
      situacao: 'Campo obrigatório',
      urgente: 'Campo obrigatório',
    });
  });

  it('preserva valores já gravados em campos que foram desativados depois', () => {
    expect(
      normalizarValores(
        campos,
        { situacao: 'Nova versão', urgente: true },
        { situacao: 'Versão antiga', antigo: 'valor de quando o campo existia' },
        { exigirObrigatorios: true },
      ),
    ).toEqual({
      situacao: 'Nova versão',
      urgente: true,
      antigo: 'valor de quando o campo existia',
    });
  });
});
