import type { WebhookChannel } from '../database/schema';
import type { Locale } from '../notifications/email/email-templates';

export interface WebhookMessage {
  text: string;
  url: string;
  linkLabel: string;
}

/** Slack and Google Chat read `<url|label>` links; the text itself must not open one. */
const escapeLinkText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The request body each chat service expects from an incoming webhook. */
export function webhookBody(channel: WebhookChannel, message: WebhookMessage) {
  switch (channel) {
    case 'slack':
    case 'google_chat':
      return { text: `${escapeLinkText(message.text)} <${message.url}|${message.linkLabel}>` };
    case 'teams':
      // An Adaptive Card, accepted by Teams Workflows and by the older connectors.
      return {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [{ type: 'TextBlock', text: message.text, wrap: true }],
              actions: [{ type: 'Action.OpenUrl', title: message.linkLabel, url: message.url }],
            },
          },
        ],
      };
  }
}

export function linkLabel(locale: Locale) {
  return locale === 'en' ? 'Open the Idea' : 'Abrir a Ideia';
}

export function publishedText(
  locale: Locale,
  idea: { number: number; title: string; category: string; author: string },
) {
  return locale === 'en'
    ? `New Idea in ${idea.category}: #${idea.number} ${idea.title} (by ${idea.author})`
    : `Nova Ideia em ${idea.category}: #${idea.number} ${idea.title} (por ${idea.author})`;
}

export function statusText(
  locale: Locale,
  idea: { number: number; title: string },
  from: string,
  to: string,
) {
  return locale === 'en'
    ? `#${idea.number} ${idea.title} went from ${from} to ${to}`
    : `#${idea.number} ${idea.title} passou de ${from} para ${to}`;
}
