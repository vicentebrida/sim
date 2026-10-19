/**
 * Similar Idea detection, text part (ADR-0002). The score mixes three signals, each between 0 and 1:
 *
 * - coverage: share of the typed title's words (stemmed) found in the existing Idea. It is the
 *   strongest signal and filters out matches on a single generic word ("melhorar", "sistema").
 * - textRank: full-text rank of the title and detection fields against the Idea.
 * - titleSimilarity: trigram similarity between titles, which catches typos and word variations.
 *
 * Weights and thresholds were tuned on realistic examples (test/similar-ideas.spec.ts).
 */
export const SIMILARITY_WEIGHTS = { coverage: 0.6, textRank: 0.25, titleSimilarity: 0.15 };

export const MIN_SIMILARITY_SCORE = 0.5;
export const MIN_TITLE_COVERAGE = 0.5;
export const MAX_SIMILAR_IDEAS = 5;

export function similarityScore(signals: {
  coverage: number;
  textRank: number;
  titleSimilarity: number;
}) {
  return (
    SIMILARITY_WEIGHTS.coverage * signals.coverage +
    SIMILARITY_WEIGHTS.textRank * signals.textRank +
    SIMILARITY_WEIGHTS.titleSimilarity * signals.titleSimilarity
  );
}

export function isSimilar(signals: {
  coverage: number;
  textRank: number;
  titleSimilarity: number;
}) {
  return signals.coverage >= MIN_TITLE_COVERAGE && similarityScore(signals) >= MIN_SIMILARITY_SCORE;
}
