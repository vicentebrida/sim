import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const emailList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.email()));

const optionalString = z
  .string()
  .optional()
  .transform((value) => value || undefined);

export const MIN_PASSWORD_LENGTH = 12;

// Integrations come from environment variables, not from the Administrator screens (ADR-0007).
const ssoSchema = z
  .object({
    SIM_SSO_MODE: z.enum(['off', 'oidc', 'oauth2']).default('off'),
    SIM_SSO_CLIENT_ID: optionalString,
    SIM_SSO_CLIENT_SECRET: optionalString,
    SIM_SSO_ISSUER: optionalString,
    SIM_SSO_AUTHORIZATION_URL: optionalString,
    SIM_SSO_TOKEN_URL: optionalString,
    SIM_SSO_USERINFO_URL: optionalString,
    SIM_SSO_SCOPES: optionalString,
    SIM_SSO_TOKEN_AUTH_METHOD: z
      .enum(['client_secret_basic', 'client_secret_post'])
      .default('client_secret_basic'),
    SIM_SSO_CLAIM_ID: z.string().default('sub'),
    SIM_SSO_CLAIM_EMAIL: z.string().default('email'),
    SIM_SSO_CLAIM_NAME: z.string().default('name'),
    SIM_SSO_CLAIM_DEPARTMENT: optionalString,
    SIM_SSO_CLAIM_PICTURE: z.string().default('picture'),
    // Claim with the provider groups (a list, or a comma/space separated text).
    SIM_SSO_CLAIM_GROUPS: z.string().default('groups'),
    // When set, only members of this group can sign in with SSO.
    SIM_ACCESS_GROUP: optionalString,
    // When set, members of this group are Administrators (and non-members are not, at each login).
    SIM_ADMIN_GROUP: optionalString,
    // Unset, the web app shows a translated "Sign in with SSO".
    SIM_SSO_BUTTON_LABEL: optionalString,
  })
  .superRefine((sso, ctx) => {
    if (sso.SIM_SSO_MODE === 'off') return;
    const required: (keyof typeof sso)[] =
      sso.SIM_SSO_MODE === 'oidc'
        ? ['SIM_SSO_CLIENT_ID', 'SIM_SSO_ISSUER']
        : [
            'SIM_SSO_CLIENT_ID',
            'SIM_SSO_AUTHORIZATION_URL',
            'SIM_SSO_TOKEN_URL',
            'SIM_SSO_USERINFO_URL',
            'SIM_SSO_SCOPES',
          ];
    for (const key of required) {
      if (!sso[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `required when SIM_SSO_MODE=${sso.SIM_SSO_MODE}`,
        });
      }
    }
  });

const baseSchema = z
  .object({
    SIM_MODE: z.enum(['api', 'worker', 'all']).default('all'),
    PORT: z.coerce.number().int().positive().default(3000),
    SIM_PUBLIC_URL: z.url().default('http://localhost:3000'),
    DATABASE_URL: z.url(),
    SIM_MIGRATE_ON_START: booleanFromString,
    SIM_ADMIN_EMAILS: emailList,
    SIM_EMERGENCY_EMAIL: z
      .email()
      .transform((email) => email.toLowerCase())
      .optional(),
    SIM_EMERGENCY_PASSWORD: z.string().min(MIN_PASSWORD_LENGTH).optional(),
    SIM_WEB_DIST: z.string().optional(),
    // Collaborators (other than Administrators) without login for this many days are deactivated.
    SIM_INACTIVITY_DAYS: z.coerce.number().int().positive().optional(),
    // Attachments are stored on disk (mount a volume here).
    SIM_DATA_DIR: z.string().default('./data'),
    SIM_ATTACHMENT_MAX_MB: z.coerce.number().positive().default(10),
    SIM_ATTACHMENT_MAX_COUNT: z.coerce.number().int().positive().default(5),
    // Stalled Ideas: days without Reviewer action (a Category can override the first two).
    SIM_STALLED_OPEN_DAYS: z.coerce.number().int().positive().default(15),
    SIM_STALLED_REVIEW_DAYS: z.coerce.number().int().positive().default(30),
    // Days after the Reviewers were told before the Administrators are.
    SIM_STALLED_ESCALATION_DAYS: z.coerce.number().int().positive().default(7),
    // Language of e-mails (the web app follows each person's browser).
    SIM_LOCALE: z.enum(['pt-BR', 'en']).default('pt-BR'),
    // Background jobs (ADR-0006). Without Redis the SIM works, but sends no e-mail.
    REDIS_URL: z.url().optional(),
    // e.g. smtp://user:password@smtp.example.com:587 (smtps:// for implicit TLS).
    SMTP_URL: z.url().optional(),
    SIM_MAIL_FROM: z.string().default('SIM <sim@localhost>'),
    // Express `trust proxy` value: true, number of proxies or a list of IPs/subnets.
    SIM_TRUST_PROXY: z
      .string()
      .default('false')
      .transform((value): boolean | number | string => {
        if (value === 'true' || value === 'false') return value === 'true';
        return /^\d+$/.test(value) ? Number(value) : value;
      }),
  })
  .refine((env) => !env.SMTP_URL || env.REDIS_URL, {
    path: ['REDIS_URL'],
    message: 'required when SMTP_URL is set (e-mails are sent by a background job)',
  })
  .refine((env) => Boolean(env.SIM_EMERGENCY_EMAIL) === Boolean(env.SIM_EMERGENCY_PASSWORD), {
    path: ['SIM_EMERGENCY_PASSWORD'],
    message: 'SIM_EMERGENCY_EMAIL and SIM_EMERGENCY_PASSWORD must be set together',
  });

export const envSchema = z.intersection(baseSchema, ssoSchema);

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
