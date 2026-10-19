import type { Status } from '../../ideas/domain/idea';
import type { NotificationType } from '../domain/recipients';

export type Locale = 'pt-BR' | 'en';

export interface EmailContext {
  locale: Locale;
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

const statusName = (locale: Locale, status: unknown) =>
  STATUS_NAMES[locale][status as Status] ?? String(status);

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
        return `Idea ${idea} moved from ${statusName(locale, data.from)} to ${statusName(locale, data.to)}.`;
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
        return `Idea ${idea} has been ${statusName(locale, data.status)} for too long and is waiting for a Reviewer.`;
      case 'stalled_escalated':
        return `Idea ${idea} is still ${statusName(locale, data.status)} after its Reviewers were told. It needs an Administrator.`;
    }
  }
  switch (type) {
    case 'new_idea':
      return `${actor} enviou a Ideia ${idea} para sua avaliação.`;
    case 'status':
      return `A Ideia ${idea} passou de ${statusName(locale, data.from)} para ${statusName(locale, data.to)}.`;
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
      return `A Ideia ${idea} está há tempo demais como ${statusName(locale, data.status)} e aguarda um Avaliador.`;
    case 'stalled_escalated':
      return `A Ideia ${idea} continua como ${statusName(locale, data.status)} mesmo após o aviso aos Avaliadores. Ela precisa de um Administrador.`;
  }
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
    subject: `[SIM] ${what}`.replace(/\s+/g, ' ').slice(0, 200),
    text: `${greeting}\n\n${what}\n\n${open}: ${context.url}\n\n--\n${footer}\n`,
    html:
      `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(what)}</p>` +
      `<p><a href="${escapeHtml(context.url)}">${open}</a></p>` +
      `<p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
  };
}
