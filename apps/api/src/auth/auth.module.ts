import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ColaboradoresModule } from '../colaboradores/colaboradores.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { SessoesService } from './sessoes.service';
import { TentativasDeLoginService } from './tentativas-de-login';
import { SsoController } from './sso/sso.controller';
import { SsoService } from './sso/sso.service';

@Module({
  imports: [ColaboradoresModule],
  controllers: [AuthController, SsoController],
  providers: [
    SessoesService,
    SsoService,
    TentativasDeLoginService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
