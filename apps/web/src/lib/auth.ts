import {
  ApiError,
  type CurrentCollaboratorDtoOutput,
  getAuthMeQueryOptions,
} from '@sim/api-client';
import type { QueryClient } from '@tanstack/react-query';

// Mirrors the API validation (PasswordChangeDto).
export const MIN_PASSWORD_LENGTH = 12;

export const currentCollaboratorQuery = getAuthMeQueryOptions({ query: { staleTime: 60_000 } });

/** Collaborator of the current session, or `null` when there is no session. */
export async function getCurrentCollaborator(
  queryClient: QueryClient,
): Promise<CurrentCollaboratorDtoOutput | null> {
  try {
    const response = await queryClient.ensureQueryData(currentCollaboratorQuery);
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** The post-login return must be an internal path (the backend applies the same rule for SSO). */
export function safeReturnTo(returnTo: string | undefined): string {
  if (
    !returnTo ||
    !returnTo.startsWith('/') ||
    returnTo.startsWith('//') ||
    returnTo.includes('\\')
  ) {
    return '/';
  }
  return returnTo;
}
