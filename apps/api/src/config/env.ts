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
    // Optional semantic search: any OpenAI-compatible embeddings service (OpenAI, Ollama, ...).
    SIM_EMBEDDINGS_URL: z.url().optional(),
    SIM_EMBEDDINGS_MODEL: optionalString,
    SIM_EMBEDDINGS_API_KEY: optionalString,
    // Cosine similarity (0 to 1) from which an Idea counts as similar in meaning.
    SIM_SEMANTIC_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
    // Collaborators (other than Administrators) without login for this many days are deactivated.
    SIM_INACTIVITY_DAYS: z.coerce.number().int().positive().optional(),
    // Where Attachments and identity images are stored: a folder (mount a volume there) or an
    // S3-compatible bucket.
    SIM_STORAGE: z.enum(['disk', 's3']).default('disk'),
    SIM_DATA_DIR: z.string().default('./data'),
    SIM_S3_BUCKET: optionalString,
    SIM_S3_REGION: z.string().default('us-east-1'),
    SIM_S3_ENDPOINT: z.url().optional(),
    SIM_S3_ACCESS_KEY_ID: optionalString,
    SIM_S3_SECRET_ACCESS_KEY: optionalString,
    SIM_S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SIM_ATTACHMENT_MAX_MB: z.coerce.number().positive().default(10),
    SIM_ATTACHMENT_MAX_COUNT: z.coerce.number().int().positive().default(5),
    // Optional antivirus: clamd address, e.g. tcp://clamav:3310. While set, every Attachment is
    // checked before it is stored, and refused when the check cannot be done.
    SIM_CLAMAV_URL: z.url({ protocol: /^tcp$/, error: 'use tcp://host:port' }).optional(),
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
    // The daily summary e-mail goes out at this hour (0-23) in this IANA time zone.
    SIM_DIGEST_HOUR: z.coerce.number().int().min(0).max(23).default(8),
    SIM_TIMEZONE: z
      .string()
      .default('UTC')
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, 'not a valid IANA time zone'),
    SIM_MAIL_FROM: z.string().default('SIM <sim@localhost>'),
    // Chat channels told about new Ideas and Status changes (incoming webhook URLs; secrets).
    SIM_WEBHOOK_SLACK_URL: z.url().optional(),
    SIM_WEBHOOK_TEAMS_URL: z.url().optional(),
    SIM_WEBHOOK_GOOGLE_CHAT_URL: z.url().optional(),
    // Which events go to the channels: `published` (new Idea) and `status` (Status change).
    SIM_WEBHOOK_EVENTS: z
      .string()
      .default('published,status')
      .transform((value) =>
        value
          .split(',')
          .map((event) => event.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(['published', 'status']))),
    // Express `trust proxy` value: true, number of proxies or a list of IPs/subnets.
    SIM_TRUST_PROXY: z
      .string()
      .default('false')
      .transform((value): boolean | number | string => {
        if (value === 'true' || value === 'false') return value === 'true';
        return /^\d+$/.test(value) ? Number(value) : value;
      }),
  })
  .refine((env) => env.SIM_STORAGE !== 's3' || env.SIM_S3_BUCKET, {
    path: ['SIM_S3_BUCKET'],
    message: 'required when SIM_STORAGE=s3',
  })
  .refine((env) => Boolean(env.SIM_S3_ACCESS_KEY_ID) === Boolean(env.SIM_S3_SECRET_ACCESS_KEY), {
    path: ['SIM_S3_SECRET_ACCESS_KEY'],
    message: 'SIM_S3_ACCESS_KEY_ID and SIM_S3_SECRET_ACCESS_KEY must be set together',
  })
  .refine((env) => !env.SIM_EMBEDDINGS_URL || env.SIM_EMBEDDINGS_MODEL, {
    path: ['SIM_EMBEDDINGS_MODEL'],
    message: 'required when SIM_EMBEDDINGS_URL is set',
  })
  .refine((env) => !env.SIM_EMBEDDINGS_URL || env.REDIS_URL, {
    path: ['REDIS_URL'],
    message: 'required when SIM_EMBEDDINGS_URL is set (Ideas are indexed by a background job)',
  })
  .refine((env) => !env.SMTP_URL || env.REDIS_URL, {
    path: ['REDIS_URL'],
    message: 'required when SMTP_URL is set (e-mails are sent by a background job)',
  })
  .refine(
    (env) =>
      !(
        env.SIM_WEBHOOK_SLACK_URL ||
        env.SIM_WEBHOOK_TEAMS_URL ||
        env.SIM_WEBHOOK_GOOGLE_CHAT_URL
      ) || env.REDIS_URL,
    {
      path: ['REDIS_URL'],
      message: 'required when a SIM_WEBHOOK_*_URL is set (messages are sent by a background job)',
    },
  )
  .refine((env) => Boolean(env.SIM_EMERGENCY_EMAIL) === Boolean(env.SIM_EMERGENCY_PASSWORD), {
    path: ['SIM_EMERGENCY_PASSWORD'],
    message: 'SIM_EMERGENCY_EMAIL and SIM_EMERGENCY_PASSWORD must be set together',
  });

export const envSchema = z.intersection(baseSchema, ssoSchema);

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // An empty variable (`SMTP_URL=` in the .env) is an unset one, so it gets the default.
  const set = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(set);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
