import { describe, expect, it } from 'vitest';
import { normalizarMencoes } from './mencoes';

const ANA = '6f1c2a4e-0d7b-4f5e-9a51-3c2b1d0e9f8a';
const BRUNO = '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b';
const DESCONHECIDO = '00000000-0000-4000-8000-000000000000';

const colaboradores = new Map([
  [ANA, 'Ana Souza'],
  [BRUNO, 'Bruno Lima'],
]);

describe('Menções', () => {
  it('reconhece as Menções e guarda o nome atual de cada Colaborador', () => {
    const { texto, mencionados } = normalizarMencoes(
      `Concordo com @[Ana](${ANA}); @[Bruno Lima](${BRUNO}) pode ajudar?`,
      colaboradores,
    );
    expect(texto).toBe(`Concordo com @[Ana Souza](${ANA}); @[Bruno Lima](${BRUNO}) pode ajudar?`);
    expect(mencionados).toEqual([ANA, BRUNO]);
  });

  it('Menção a quem não existe (ou está inativo) vira texto simples', () => {
    const { texto, mencionados } = normalizarMencoes(
      `Falar com @[Fulano](${DESCONHECIDO})`,
      colaboradores,
    );
    expect(texto).toBe('Falar com @Fulano');
    expect(mencionados).toEqual([]);
  });

  it('mencionar a mesma pessoa duas vezes conta uma vez', () => {
    const { mencionados } = normalizarMencoes(
      `@[Ana Souza](${ANA}) e de novo @[Ana Souza](${ANA})`,
      colaboradores,
    );
    expect(mencionados).toEqual([ANA]);
  });

  it('texto sem marcação fica como está', () => {
    expect(normalizarMencoes('Sem menções, só um e-mail@empresa.com', colaboradores)).toEqual({
      texto: 'Sem menções, só um e-mail@empresa.com',
      mencionados: [],
    });
  });
});
