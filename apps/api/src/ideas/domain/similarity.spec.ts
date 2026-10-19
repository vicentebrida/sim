import { describe, expect, it } from 'vitest';
import { isSimilar, similarityScore } from './similarity';

describe('Similar Idea score', () => {
  it('an Idea covering the typed title is similar', () => {
    // "Relatório de vendas demora" vs "Relatório de vendas mais rápido"
    expect(isSimilar({ coverage: 0.667, textRank: 0.737, titleSimilarity: 0.556 })).toBe(true);
  });

  it('sharing a single generic word is not enough, even with a high text rank', () => {
    // "Sistema de ponto eletrônico" vs "Melhorar o sistema de chamados de TI"
    expect(isSimilar({ coverage: 0.333, textRank: 0.667, titleSimilarity: 0.216 })).toBe(false);
  });

  it('half the title in common needs support from the other signals', () => {
    expect(isSimilar({ coverage: 0.5, textRank: 0.5, titleSimilarity: 0.2 })).toBe(false);
    expect(isSimilar({ coverage: 0.5, textRank: 0.8, titleSimilarity: 0.5 })).toBe(true);
  });

  it('the score grows with each signal', () => {
    const base = { coverage: 0.5, textRank: 0.5, titleSimilarity: 0.5 };
    expect(similarityScore({ ...base, coverage: 1 })).toBeGreaterThan(similarityScore(base));
    expect(similarityScore({ ...base, textRank: 1 })).toBeGreaterThan(similarityScore(base));
    expect(similarityScore({ ...base, titleSimilarity: 1 })).toBeGreaterThan(similarityScore(base));
  });
});
