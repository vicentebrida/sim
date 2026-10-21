import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CollaboratorsModule } from '../collaborators/collaborators.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { LoginAttemptsService } from './login-attempts';
import { SessionsService } from './sessions.service';
import { SsoController } from './sso/sso.controller';
import { SsoService } from './sso/sso.service';

@Module({
  imports: [CollaboratorsModule],
  controllers: [AuthController, SsoController],
  providers: [
    SessionsService,
    SsoService,
    LoginAttemptsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule {}
