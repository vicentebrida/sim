import type { CookieOptions } from 'express';
import type { Env } from '../config/env';

export const COOKIE_SESSAO = 'sim_sessao';
export const COOKIE_SSO = 'sim_sso';

export function opcoesCookie(env: Env, maxAge: number, path = '/'): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.SIM_PUBLIC_URL.startsWith('https://'),
    path,
    maxAge,
  };
}
