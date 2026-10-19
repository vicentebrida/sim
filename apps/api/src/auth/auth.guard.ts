import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DomainError } from '../common/domain-error';
import { SESSION_COOKIE } from './cookies';
import { ADMINISTRATOR_ONLY, ALLOWS_TEMPORARY_PASSWORD, PUBLIC } from './decorators';
import { SessionsService } from './sessions.service';

/** Global guard: every route requires a session, except those marked `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    const collaborator =
      typeof token === 'string' ? await this.sessions.validate(token) : undefined;
    if (!collaborator) throw new UnauthorizedException();
    request.collaborator = collaborator;

    if (
      collaborator.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOWS_TEMPORARY_PASSWORD, targets)
    ) {
      throw new DomainError(
        'PASSWORD_CHANGE_REQUIRED',
        'Change the temporary password to continue',
      );
    }

    if (
      this.reflector.getAllAndOverride<boolean>(ADMINISTRATOR_ONLY, targets) &&
      !collaborator.administrator
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
