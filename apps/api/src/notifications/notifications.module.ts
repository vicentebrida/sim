import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { EmailDispatcher } from './email/email-dispatcher.service';
import { Mailer, SmtpMailer } from './email/mailer';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailDispatcher,
    {
      provide: Mailer,
      inject: [ENV],
      // Without SMTP_URL nothing is recorded as `pending`, so this one is never called.
      useFactory: (env: Env): Mailer =>
        env.SMTP_URL
          ? new SmtpMailer(env.SMTP_URL, env.SIM_MAIL_FROM)
          : { send: () => Promise.reject(new Error('SMTP_URL is not configured')) },
    },
  ],
  exports: [NotificationsService, EmailDispatcher],
})
export class NotificationsModule {}
