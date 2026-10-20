import { describe, expect, it } from 'vitest';
import {
  type EmailContext,
  renderDigest,
  renderEmail,
} from '../src/notifications/email/email-templates';

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
    ['stalled', 'aguarda um Avaliador'],
    ['stalled_escalated', 'precisa de um Administrador'],
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

describe('renderDigest', () => {
  it('lists every Notification with its link, in the language of the installation', () => {
    const second = {
      ...base,
      ideaNumber: 8,
      ideaTitle: 'Outra',
      url: 'https://sim.example.com/ideas/8',
      type: 'comment' as const,
      data: {},
    };
    const email = renderDigest({
      ...base,
      items: [base, second],
      brand: { name: 'Acme', color: null },
    });
    expect(email.subject).toBe('[Acme] Resumo do dia: 2 novidades');
    expect(email.text).toContain('Vagas para motos');
    expect(email.text).toContain('https://sim.example.com/ideas/8');
    expect(renderDigest({ ...base, locale: 'en', items: [base] }).subject).toBe(
      '[SIM] Daily summary: 1 update',
    );
  });

  it('escapes HTML coming from titles', () => {
    const email = renderDigest({
      ...base,
      items: [{ ...base, ideaTitle: '<img src=x onerror=alert(1)>' }],
    });
    expect(email.html).not.toContain('<img');
  });
});
