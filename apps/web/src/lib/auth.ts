import { ApiError, type ColaboradorAtualDtoOutput, getAuthMeQueryOptions } from '@sim/api-client';
import type { QueryClient } from '@tanstack/react-query';

// Espelha a validação da API (TrocaDeSenhaDto).
export const SENHA_MINIMA = 12;

export const colaboradorAtualQuery = getAuthMeQueryOptions({ query: { staleTime: 60_000 } });

/** Colaborador da sessão atual, ou `null` quando não há sessão. */
export async function obterColaboradorAtual(
  queryClient: QueryClient,
): Promise<ColaboradorAtualDtoOutput | null> {
  try {
    const resposta = await queryClient.ensureQueryData(colaboradorAtualQuery);
    return resposta.data;
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 401) return null;
    throw erro;
  }
}

/** Retorno pós-login só pode ser um caminho interno (o backend aplica a mesma regra no SSO). */
export function retornoSeguro(retorno: string | undefined): string {
  if (!retorno || !retorno.startsWith('/') || retorno.startsWith('//') || retorno.includes('\\')) {
    return '/';
  }
  return retorno;
}
