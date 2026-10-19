import { ApiError } from '@sim/api-client';

/** Mensagem da API (regras de negócio vêm em português) ou a genérica; nada quando não há erro. */
export function mensagemDaApi(erro: unknown, padrao: string) {
  if (erro instanceof ApiError) {
    return (erro.body as { message?: string } | undefined)?.message ?? padrao;
  }
  return erro ? padrao : undefined;
}
