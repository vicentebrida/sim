import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Collaborator } from '../database/schema';

export const PUBLIC = 'sim:public';
export const ALLOWS_TEMPORARY_PASSWORD = 'sim:allows-temporary-password';
export const ADMINISTRATOR_ONLY = 'sim:administrator-only';

/** Route reachable without a session. */
export const Public = () => SetMetadata(PUBLIC, true);

/** Route reachable while the Collaborator still has to change the temporary password. */
export const AllowsTemporaryPassword = () => SetMetadata(ALLOWS_TEMPORARY_PASSWORD, true);

export const AdministratorOnly = () => SetMetadata(ADMINISTRATOR_ONLY, true);

export const CurrentCollaborator = createParamDecorator(
  (_: unknown, context: ExecutionContext): Collaborator => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.collaborator!;
  },
);

declare module 'express' {
  interface Request {
    collaborator?: Collaborator;
  }
}
