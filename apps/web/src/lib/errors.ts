import { ApiError } from '@sim/api-client';
import type { TFunction } from 'i18next';
import i18n from '@/i18n';

/** Error code sent by the API (`code`), when there is one. */
export function apiErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  return (error.body as { code?: string } | undefined)?.code;
}

/** Translated message for an API error code, or the generic one; nothing when there is no error. */
export function apiErrorMessage(error: unknown, t: TFunction): string | undefined {
  if (!error) return undefined;
  const code = apiErrorCode(error);
  return code && i18n.exists(`errors.codes.${code}`)
    ? t(`errors.codes.${code}`)
    : t('errors.generic');
}
