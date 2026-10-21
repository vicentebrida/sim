import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env';

type Locale = Env['SIM_LOCALE'];

const current = new AsyncLocalStorage<Locale>();

/**
 * The language of whoever made the request, by its Accept-Language, with the same rule the web
 * app uses for its own language: Portuguese if it starts with "pt", English otherwise.
 */
export function viewerLocaleMiddleware(request: Request, _response: Response, next: NextFunction) {
  const language = request.headers['accept-language']?.trim().toLowerCase();
  if (!language || language.startsWith('*')) return next();
  current.run(language.startsWith('pt') ? 'pt-BR' : 'en', next);
}

/**
 * The language for texts the API writes into a response (e.g. "Anonymous collaborator"). Outside a
 * request (e-mails, chat channels) or without Accept-Language, the installation one.
 */
export const viewerLocale = (installation: Locale): Locale => current.getStore() ?? installation;
