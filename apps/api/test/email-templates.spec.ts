import { describe, expect, it } from 'vitest';
import { type EmailContext, renderEmail } from '../src/notifications/email/email-templates';

const base: EmailContext = {
  locale: 'pt-BR',
  type: 'status',
  recipientName: 'Ana',
  actorName: 'Bruno',
  ideaNumber: 7,
  ideaTitle: 'Vagas para motos',
  data: { from: 'open', to: 'under_review' },
  url: 'https://sim.example.com/ideas/7',
};

describe('renderEmail', () => {
  it('describes a Status change with the names of the Statuses', () => {
    const email = renderEmail(base);
    expect(email.subject).toBe(
      '[SIM] A Ideia #7 "Vagas para motos" passou de Aberta para Em análise.',
    );
    expect(email.text).toContain('Olá, Ana,');
    expect(email.text).toContain(base.url);
  });

  it('speaks the installation language', () => {
    expect(renderEmail({ ...base, locale: 'en' }).subject).toBe(
      '[SIM] Idea #7 "Vagas para motos" moved from Open to Under review.',
    );
  });

  it.each([
    ['comment', 'comentou'],
    ['reply', 'respondeu'],
    ['mention', 'mencionou'],
    ['new_idea', 'para sua avaliação'],
  ] as const)('covers %s', (type, expected) => {
    expect(renderEmail({ ...base, type, data: {} }).subject).toContain(expected);
  });

  it('names the original Idea on a Duplicate', () => {
    const email = renderEmail({
      ...base,
      type: 'duplicate',
      data: { original: { number: 3, title: 'Original' } },
    });
    expect(email.subject).toContain('#3 "Original"');
  });

  it('escapes HTML coming from titles and names', () => {
    const email = renderEmail({ ...base, ideaTitle: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>');
  });
});
