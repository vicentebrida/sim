import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Colaborador } from '../database/schema';

export const PUBLICO = 'sim:publico';
export const PERMITE_SENHA_TEMPORARIA = 'sim:permite-senha-temporaria';
export const SOMENTE_ADMINISTRADOR = 'sim:somente-administrador';

/** Rota acessível sem sessão. */
export const Publico = () => SetMetadata(PUBLICO, true);

/** Rota acessível mesmo enquanto o Colaborador ainda precisa trocar a senha temporária. */
export const PermiteSenhaTemporaria = () => SetMetadata(PERMITE_SENHA_TEMPORARIA, true);

export const SomenteAdministrador = () => SetMetadata(SOMENTE_ADMINISTRADOR, true);

export const ColaboradorAtual = createParamDecorator(
  (_: unknown, context: ExecutionContext): Colaborador => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.colaborador!;
  },
);

declare module 'express' {
  interface Request {
    colaborador?: Colaborador;
  }
}
