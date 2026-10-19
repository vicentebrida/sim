import type { CookieOptions } from 'express';
import type { Env } from '../config/env';

export const SESSION_COOKIE = 'sim_session';
export const SSO_COOKIE = 'sim_sso';

export function cookieOptions(env: Env, maxAge: number, path = '/'): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.SIM_PUBLIC_URL.startsWith('https://'),
    path,
    maxAge,
  };
}
