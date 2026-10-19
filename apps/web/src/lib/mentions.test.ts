import { describe, expect, it } from 'vitest';
import { segment, toEditable, toMarkup } from './mentions';

const ANA = { id: '6f1c2a4e-0d7b-4f5e-9a51-3c2b1d0e9f8a', name: 'Ana Souza' };
const ANA_LIMA = { id: '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b', name: 'Ana' };

describe('Mentions in Comment text', () => {
  it('splits text and Mentions for display', () => {
    expect(segment(`Oi @[Ana Souza](${ANA.id}), tudo bem?`)).toEqual([
      { type: 'text', value: 'Oi ' },
      { type: 'mention', ...ANA },
      { type: 'text', value: ', tudo bem?' },
    ]);
  });

  it('round-trips between markup and editor text', () => {
    const marked = `@[Ana Souza](${ANA.id}) e @[Ana](${ANA_LIMA.id}) podem ajudar`;
    const { text, mentioned } = toEditable(marked);
    expect(text).toBe('@Ana Souza e @Ana podem ajudar');
    expect(toMarkup(text, mentioned)).toBe(marked);
  });

  it('a Mention erased from the text is not sent, and a similar name is not confused', () => {
    expect(toMarkup('Falar com @Anabela', [ANA_LIMA])).toBe('Falar com @Anabela');
    expect(toMarkup('Sem menção', [ANA])).toBe('Sem menção');
  });
});
