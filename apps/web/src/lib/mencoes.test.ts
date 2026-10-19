import { describe, expect, it } from 'vitest';
import { paraEdicao, paraEnvio, segmentar } from './mencoes';

const ANA = { id: '6f1c2a4e-0d7b-4f5e-9a51-3c2b1d0e9f8a', nome: 'Ana Souza' };
const ANA_LIMA = { id: '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b', nome: 'Ana' };

describe('Menções no texto do Comentário', () => {
  it('separa texto e Menções para exibir', () => {
    expect(segmentar(`Oi @[Ana Souza](${ANA.id}), tudo bem?`)).toEqual([
      { tipo: 'texto', valor: 'Oi ' },
      { tipo: 'mencao', ...ANA },
      { tipo: 'texto', valor: ', tudo bem?' },
    ]);
  });

  it('ida e volta entre a marcação e o texto do editor', () => {
    const marcado = `@[Ana Souza](${ANA.id}) e @[Ana](${ANA_LIMA.id}) podem ajudar`;
    const { texto, mencionados } = paraEdicao(marcado);
    expect(texto).toBe('@Ana Souza e @Ana podem ajudar');
    expect(paraEnvio(texto, mencionados)).toBe(marcado);
  });

  it('Menção apagada do texto não é enviada, e nome parecido não é confundido', () => {
    expect(paraEnvio('Falar com @Anabela', [ANA_LIMA])).toBe('Falar com @Anabela');
    expect(paraEnvio('Sem menção', [ANA])).toBe('Sem menção');
  });
});
