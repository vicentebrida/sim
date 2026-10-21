import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

const PLURAL = /_(zero|one|two|few|many|other)$/;

function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`.replace(PLURAL, '')],
  );
}

const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Translations', () => {
  it('have the same keys in every language', () => {
    expect(new Set(keys(en))).toEqual(new Set(keys(ptBR)));
  });

  it('have every key the code asks for', () => {
    const known = new Set(keys(ptBR));
    const missing = Object.entries(sources).flatMap(([file, source]) =>
      [...source.matchAll(/\bt\(\s*'([\w.]+)'/g)]
        .map(([, key]) => key!)
        .filter((key) => !known.has(key))
        .map((key) => `${key} (${file})`),
    );
    expect(missing).toEqual([]);
  });
});
