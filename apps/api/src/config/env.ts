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

export const SENHA_MINIMA = 12;

// Integrações vêm de variáveis de ambiente, não da tela do Administrador (ADR-0007).
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
    SIM_SSO_BUTTON_LABEL: z.string().default('Entrar com SSO'),
  })
  .superRefine((sso, ctx) => {
    if (sso.SIM_SSO_MODE === 'off') return;
    const exigidas: (keyof typeof sso)[] =
      sso.SIM_SSO_MODE === 'oidc'
        ? ['SIM_SSO_CLIENT_ID', 'SIM_SSO_ISSUER']
        : [
            'SIM_SSO_CLIENT_ID',
            'SIM_SSO_AUTHORIZATION_URL',
            'SIM_SSO_TOKEN_URL',
            'SIM_SSO_USERINFO_URL',
            'SIM_SSO_SCOPES',
          ];
    for (const chave of exigidas) {
      if (!sso[chave]) {
        ctx.addIssue({
          code: 'custom',
          path: [chave],
          message: `obrigatória quando SIM_SSO_MODE=${sso.SIM_SSO_MODE}`,
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
    SIM_EMERGENCY_PASSWORD: z.string().min(SENHA_MINIMA).optional(),
    SIM_WEB_DIST: z.string().optional(),
    // Valor do `trust proxy` do Express: true, número de proxies ou lista de IPs/sub-redes.
    SIM_TRUST_PROXY: z
      .string()
      .default('false')
      .transform((valor): boolean | number | string => {
        if (valor === 'true' || valor === 'false') return valor === 'true';
        return /^\d+$/.test(valor) ? Number(valor) : valor;
      }),
  })
  .refine((env) => Boolean(env.SIM_EMERGENCY_EMAIL) === Boolean(env.SIM_EMERGENCY_PASSWORD), {
    path: ['SIM_EMERGENCY_PASSWORD'],
    message: 'SIM_EMERGENCY_EMAIL e SIM_EMERGENCY_PASSWORD devem ser definidas juntas',
  });

export const envSchema = z.intersection(baseSchema, ssoSchema);

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
