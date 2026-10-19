// Mutator usado por todo o código gerado pelo Orval: mesma origem (o NestJS serve a SPA) e cookies de sessão.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Requisição falhou com status ${status}`);
  }
}

export async function simFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'include' });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(response.status, body);
  return { data: body, status: response.status, headers: response.headers } as T;
}

// Lidos pelo Orval: toda falha chega aos hooks como ApiError, e corpos são enviados como estão.
export type ErrorType<_Erro> = ApiError;
export type BodyType<Corpo> = Corpo;
