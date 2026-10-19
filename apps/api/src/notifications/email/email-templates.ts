import type { Status } from '../../ideas/domain/idea';
import type { NotificationType } from '../domain/recipients';

export type Locale = 'pt-BR' | 'en';

export interface EmailContext {
  locale: Locale;
  /** Installation name and primary color (visual identity). */
  brand?: { name: string; color: string | null };
  /** Names the Administrator gave to Statuses, replacing the defaults. */
  statusLabels?: Partial<Record<Status, string>>;
  type: NotificationType;
  recipientName: string;
  actorName: string | null;
  ideaNumber: number;
  ideaTitle: string;
  data: Record<string, unknown>;
  url: string;
}

const STATUS_NAMES: Record<Locale, Record<Status, string>> = {
  'pt-BR': {
    draft: 'Rascunho',
    open: 'Aberta',
    under_review: 'Em análise',
    approved: 'Aprovada',
    in_progress: 'Em execução',
    done: 'Concluída',
    declined: 'Recusada',
    duplicate: 'Duplicada',
    archived: 'Arquivada',
  },
  en: {
    draft: 'Draft',
    open: 'Open',
    under_review: 'Under review',
    approved: 'Approved',
    in_progress: 'In progress',
    done: 'Done',
    declined: 'Declined',
    duplicate: 'Duplicate',
    archived: 'Archived',
  },
};

const statusName = (locale: Locale, status: unknown, labels: EmailContext['statusLabels'] = {}) =>
  labels[status as Status] ?? STATUS_NAMES[locale][status as Status] ?? String(status);

const who = (context: EmailContext) =>
  context.actorName ?? (context.locale === 'en' ? 'Someone' : 'Alguém');

/** One sentence saying what happened, in the language of the installation. */
function sentence(context: EmailContext): string {
  const { locale, type, data } = context;
  const actor = who(context);
  const idea = `#${context.ideaNumber} "${context.ideaTitle}"`;
  if (locale === 'en') {
    switch (type) {
      case 'new_idea':
        return `${actor} sent Idea ${idea} for your review.`;
      case 'status':
        return `Idea ${idea} moved from ${statusName(locale, data.from, context.statusLabels)} to ${statusName(locale, data.to, context.statusLabels)}.`;
      case 'duplicate': {
        const original = data.original as { number: number; title: string };
        return `Idea ${idea} was marked as a Duplicate of #${original.number} "${original.title}". You now follow the original.`;
      }
      case 'comment':
        return `${actor} commented on Idea ${idea}.`;
      case 'reply':
        return `${actor} replied to your Comment on Idea ${idea}.`;
      case 'mention':
        return `${actor} mentioned you in Idea ${idea}.`;
      case 'stalled':
        return `Idea ${idea} has been ${statusName(locale, data.status, context.statusLabels)} for too long and is waiting for a Reviewer.`;
      case 'stalled_escalated':
        return `Idea ${idea} is still ${statusName(locale, data.status, context.statusLabels)} after its Reviewers were told. It needs an Administrator.`;
    }
  }
  switch (type) {
    case 'new_idea':
      return `${actor} enviou a Ideia ${idea} para sua avaliação.`;
    case 'status':
      return `A Ideia ${idea} passou de ${statusName(locale, data.from, context.statusLabels)} para ${statusName(locale, data.to, context.statusLabels)}.`;
    case 'duplicate': {
      const original = data.original as { number: number; title: string };
      return `A Ideia ${idea} foi marcada como Duplicada de #${original.number} "${original.title}". Você passou a seguir a original.`;
    }
    case 'comment':
      return `${actor} comentou na Ideia ${idea}.`;
    case 'reply':
      return `${actor} respondeu ao seu Comentário na Ideia ${idea}.`;
    case 'mention':
      return `${actor} mencionou você na Ideia ${idea}.`;
    case 'stalled':
      return `A Ideia ${idea} está há tempo demais como ${statusName(locale, data.status, context.statusLabels)} e aguarda um Avaliador.`;
    case 'stalled_escalated':
      return `A Ideia ${idea} continua como ${statusName(locale, data.status, context.statusLabels)} mesmo após o aviso aos Avaliadores. Ela precisa de um Administrador.`;
  }
}

/** A button in the brand color, with readable text on it. */
function buttonStyle(color: string | null) {
  const base = 'display:inline-block;padding:8px 16px;border-radius:6px;text-decoration:none;';
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return `${base}background:#4f46e5;color:#ffffff`;
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  const light = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.6;
  return `${base}background:${color};color:${light ? '#111111' : '#ffffff'}`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * E-mails carry no Comment text: if it is hidden or removed later, nothing stays in inboxes.
 */
export function renderEmail(context: EmailContext) {
  const en = context.locale === 'en';
  const what = sentence(context);
  const greeting = en ? `Hi ${context.recipientName},` : `Olá, ${context.recipientName},`;
  const open = en ? 'Open the Idea' : 'Abrir a Ideia';
  const footer = en
    ? 'You can turn off e-mail Notifications in the SIM, under Notifications.'
    : 'Você pode desligar os e-mails no SIM, em Notificações.';
  return {
    subject: `[${context.brand?.name ?? 'SIM'}] ${what}`.replace(/\s+/g, ' ').slice(0, 200),
    text: `${greeting}\n\n${what}\n\n${open}: ${context.url}\n\n--\n${footer}\n`,
    html:
      `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(what)}</p>` +
      `<p><a href="${escapeHtml(context.url)}" style="${buttonStyle(context.brand?.color ?? null)}">${open}</a></p>` +
      `<p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
  };
}
