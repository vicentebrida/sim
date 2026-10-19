import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CollaboratorsService } from '../../collaborators/collaborators.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { cookieOptions, SESSION_COOKIE, SSO_COOKIE } from '../cookies';
import { Public } from '../decorators';
import { SESSION_DURATION_MS, SessionsService } from '../sessions.service';
import { SsoService, type SsoTransaction } from './sso.service';

const SSO_COOKIE_PATH = '/api/auth/sso';
const TRANSACTION_TTL_MS = 10 * 60 * 1000;

/** Only accepts internal paths, so the post-login return does not become an open redirect. */
export function safeReturnTo(returnTo: unknown): string {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/';
  }
  return returnTo.includes('\\') ? '/' : returnTo;
}

function readTransaction(value: unknown): SsoTransaction | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as SsoTransaction;
  } catch {
    return undefined;
  }
}

/** Browser flow (redirects), not part of the documented REST API. */
@ApiExcludeController()
@Controller('auth/sso')
@Public()
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly sso: SsoService,
    private readonly collaborators: CollaboratorsService,
    private readonly sessions: SessionsService,
  ) {}

  @Get('start')
  async start(@Query('returnTo') returnTo: unknown, @Res() res: Response) {
    if (!this.sso.enabled) throw new NotFoundException();
    try {
      const { url, transaction } = await this.sso.start(safeReturnTo(returnTo));
      res.cookie(
        SSO_COOKIE,
        Buffer.from(JSON.stringify(transaction)).toString('base64url'),
        cookieOptions(this.env, TRANSACTION_TTL_MS, SSO_COOKIE_PATH),
      );
      res.redirect(url.toString());
    } catch (error) {
      this.logger.error('Could not start the SSO login', error as Error);
      res.redirect('/login?error=sso');
    }
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    if (!this.sso.enabled) throw new NotFoundException();
    const transaction = readTransaction(req.cookies?.[SSO_COOKIE]);
    res.clearCookie(SSO_COOKIE, { path: SSO_COOKIE_PATH });
    if (!transaction) return res.redirect('/login?error=sso');

    try {
      const currentUrl = new URL(req.originalUrl, this.env.SIM_PUBLIC_URL);
      const profile = await this.sso.finish(currentUrl, transaction);
      const collaborator = await this.collaborators.provisionFromSso(profile);
      if (!collaborator.active) return res.redirect('/login?error=inactive');

      const token = await this.sessions.create(collaborator.id);
      res.cookie(SESSION_COOKIE, token, cookieOptions(this.env, SESSION_DURATION_MS));
      return res.redirect(safeReturnTo(transaction.returnTo));
    } catch (error) {
      this.logger.error('SSO callback failed', error as Error);
      return res.redirect('/login?error=sso');
    }
  }
}
