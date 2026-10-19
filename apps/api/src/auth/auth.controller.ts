import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { CollaboratorsService } from '../collaborators/collaborators.service';
import { EmergencyAccountService } from '../collaborators/emergency-account.service';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { Collaborator } from '../database/schema';
import {
  AccessConfigurationDto,
  CredentialsDto,
  CurrentCollaboratorDto,
  PasswordChangeDto,
} from './auth.dto';
import { cookieOptions, SESSION_COOKIE } from './cookies';
import { AllowsTemporaryPassword, CurrentCollaborator, Public } from './decorators';
import { LoginAttemptsService, TooManyAttemptsException } from './login-attempts';
import { verifyPassword } from './password';
import { SESSION_DURATION_MS, SessionsService } from './sessions.service';
import { SsoService } from './sso/sso.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly collaborators: CollaboratorsService,
    private readonly emergencyAccount: EmergencyAccountService,
    private readonly sessions: SessionsService,
    private readonly sso: SsoService,
    private readonly attempts: LoginAttemptsService,
  ) {}

  @Get('configuration')
  @Public()
  @ZodResponse({ status: 200, type: AccessConfigurationDto })
  configuration() {
    return {
      localLogin: true,
      sso: { enabled: this.sso.enabled, label: this.sso.label ?? null },
    };
  }

  @Post('login')
  @Public()
  @ApiTooManyRequestsResponse({ description: 'Too many attempts; wait and try again' })
  @ZodResponse({ status: 200, type: CurrentCollaboratorDto })
  async login(
    @Body() credentials: CredentialsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? 'unknown';
    try {
      this.attempts.check(ip, credentials.email);
    } catch (error) {
      if (error instanceof TooManyAttemptsException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }

    const collaborator = await this.collaborators.findByEmail(credentials.email);
    const passwordMatches = await verifyPassword(collaborator?.passwordHash, credentials.password);
    // Same answer for unknown e-mail, wrong password and inactive Collaborator.
    if (!collaborator || !passwordMatches || !collaborator.active) {
      this.attempts.recordFailure(ip, credentials.email);
      throw new DomainError('INVALID_CREDENTIALS', 'Invalid e-mail or password');
    }
    this.attempts.recordSuccess(ip, credentials.email);
    await this.startSession(collaborator.id, res);
    return collaborator;
  }

  @Post('logout')
  @AllowsTemporaryPassword()
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await this.sessions.end(token);
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(this.env, 0), maxAge: undefined });
  }

  @Get('me')
  @AllowsTemporaryPassword()
  @ZodResponse({ status: 200, type: CurrentCollaboratorDto })
  me(@CurrentCollaborator() collaborator: Collaborator) {
    return collaborator;
  }

  @Post('change-password')
  @AllowsTemporaryPassword()
  @HttpCode(204)
  @ApiNoContentResponse()
  async changePassword(
    @CurrentCollaborator() collaborator: Collaborator,
    @Body() data: PasswordChangeDto,
    @Req() req: Request,
  ) {
    if (this.emergencyAccount.isEmergencyAccount(collaborator.email)) {
      throw new DomainError(
        'EMERGENCY_PASSWORD_FROM_ENV',
        'The emergency account password is set by SIM_EMERGENCY_PASSWORD',
      );
    }
    if (!collaborator.passwordHash) {
      throw new DomainError('NO_LOCAL_PASSWORD', 'This Collaborator signs in with SSO only');
    }
    if (!(await verifyPassword(collaborator.passwordHash, data.currentPassword))) {
      throw new DomainError('WRONG_CURRENT_PASSWORD', 'Current password is wrong');
    }
    if (data.newPassword === data.currentPassword) {
      throw new DomainError('SAME_PASSWORD', 'The new password must differ from the current one');
    }
    await this.collaborators.setPassword(collaborator.id, data.newPassword);
    await this.sessions.endOthers(collaborator.id, req.cookies[SESSION_COOKIE] as string);
  }

  async startSession(collaboratorId: string, res: Response) {
    const token = await this.sessions.create(collaboratorId);
    await this.collaborators.recordLogin(collaboratorId);
    res.cookie(SESSION_COOKIE, token, cookieOptions(this.env, SESSION_DURATION_MS));
  }
}
