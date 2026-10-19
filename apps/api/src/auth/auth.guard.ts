import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { COOKIE_SESSAO } from './cookies';
import { PERMITE_SENHA_TEMPORARIA, PUBLICO, SOMENTE_ADMINISTRADOR } from './decorators';
import { SessoesService } from './sessoes.service';

export const CODIGO_TROCA_DE_SENHA_PENDENTE = 'TROCA_DE_SENHA_PENDENTE';

/** Guard global: toda rota exige sessão, salvo as marcadas com `@Publico()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessoes: SessoesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, alvos)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token: unknown = request.cookies?.[COOKIE_SESSAO];
    const colaborador = typeof token === 'string' ? await this.sessoes.validar(token) : undefined;
    if (!colaborador) throw new UnauthorizedException();
    request.colaborador = colaborador;

    if (
      colaborador.deveTrocarSenha &&
      !this.reflector.getAllAndOverride<boolean>(PERMITE_SENHA_TEMPORARIA, alvos)
    ) {
      throw new ForbiddenException({
        message: 'Troque a senha temporária para continuar',
        codigo: CODIGO_TROCA_DE_SENHA_PENDENTE,
      });
    }

    if (
      this.reflector.getAllAndOverride<boolean>(SOMENTE_ADMINISTRADOR, alvos) &&
      !colaborador.administrador
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
