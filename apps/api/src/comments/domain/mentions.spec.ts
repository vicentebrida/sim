import { describe, expect, it } from 'vitest';
import { normalizeMentions } from './mentions';

const ANA = '6f1c2a4e-0d7b-4f5e-9a51-3c2b1d0e9f8a';
const BRUNO = '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

const collaborators = new Map([
  [ANA, 'Ana Souza'],
  [BRUNO, 'Bruno Lima'],
]);

describe('Mentions', () => {
  it('recognizes Mentions and keeps each Collaborator current name', () => {
    const { text, mentioned } = normalizeMentions(
      `I agree with @[Ana](${ANA}); can @[Bruno Lima](${BRUNO}) help?`,
      collaborators,
    );
    expect(text).toBe(`I agree with @[Ana Souza](${ANA}); can @[Bruno Lima](${BRUNO}) help?`);
    expect(mentioned).toEqual([ANA, BRUNO]);
  });

  it('a Mention of someone unknown (or inactive) becomes plain text', () => {
    const { text, mentioned } = normalizeMentions(`Talk to @[John](${UNKNOWN})`, collaborators);
    expect(text).toBe('Talk to @John');
    expect(mentioned).toEqual([]);
  });

  it('mentioning the same person twice counts once', () => {
    const { mentioned } = normalizeMentions(
      `@[Ana Souza](${ANA}) and again @[Ana Souza](${ANA})`,
      collaborators,
    );
    expect(mentioned).toEqual([ANA]);
  });

  it('text without markup stays as is', () => {
    expect(normalizeMentions('No mentions, just an e-mail@company.com', collaborators)).toEqual({
      text: 'No mentions, just an e-mail@company.com',
      mentioned: [],
    });
  });
});
