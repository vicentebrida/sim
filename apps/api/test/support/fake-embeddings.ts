import { EmbeddingProvider } from '../../src/semantic/embedding-provider';

const DIMENSIONS = 64;

/** Words with the same meaning share a concept, which is all a real model would give us here. */
const CONCEPTS: Record<string, string> = {
  carro: 'veiculo',
  carros: 'veiculo',
  automovel: 'veiculo',
  veiculo: 'veiculo',
  estacionamento: 'garagem',
  garagem: 'garagem',
  vagas: 'garagem',
  cafe: 'bebida',
  cafeteira: 'bebida',
  bebida: 'bebida',
  lento: 'demora',
  demora: 'demora',
  devagar: 'demora',
  relatorio: 'relatorio',
};

const STOP = new Set([
  'de',
  'do',
  'da',
  'o',
  'a',
  'para',
  'no',
  'na',
  'um',
  'uma',
  'e',
  'muito',
  'texto',
]);

function hash(word: string) {
  let value = 5381;
  for (const char of word) value = (value * 33 + char.charCodeAt(0)) % 1_000_003;
  return value % DIMENSIONS;
}

/** Deterministic stand-in for a real model: a normalized bag of concepts. */
export function fakeVector(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOP.has(word));
  for (const word of words) vector[hash(CONCEPTS[word] ?? word)]! += 1;
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

export class FakeEmbeddings extends EmbeddingProvider {
  calls: string[][] = [];
  failing = false;

  async embed(texts: string[]) {
    this.calls.push(texts);
    if (this.failing) throw new Error('embeddings service down');
    return texts.map(fakeVector);
  }
}
