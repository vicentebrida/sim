import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../config/env';

export class AccessConfigurationDto extends createZodDto(
  z.object({
    localLogin: z.boolean(),
    // `label` is null when SIM_SSO_BUTTON_LABEL is unset; the web app shows a translated default.
    sso: z.object({ enabled: z.boolean(), label: z.string().nullable() }),
    // Limits for Attachments, so the web app can check files before sending.
    attachments: z.object({
      maxBytes: z.number().int(),
      maxCount: z.number().int(),
      extensions: z.array(z.string()),
    }),
  }),
) {}

export class CredentialsDto extends createZodDto(
  z.object({
    email: z.email().transform((email) => email.toLowerCase()),
    password: z.string().min(1),
  }),
) {}

export class PasswordChangeDto extends createZodDto(
  z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(256),
  }),
) {}

export class CurrentCollaboratorDto extends createZodDto(
  z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    department: z.string().nullable(),
    pictureUrl: z.string().nullable(),
    administrator: z.boolean(),
    mustChangePassword: z.boolean(),
  }),
) {}
