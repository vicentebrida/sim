import { createTransport } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends an e-mail. An abstract class so tests can replace it. */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

export class SmtpMailer extends Mailer {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    super();
    this.transport = createTransport(smtpUrl);
  }

  async send(message: MailMessage) {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
