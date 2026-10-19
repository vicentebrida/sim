import { useAuthConfiguration } from '@sim/api-client';

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Problem with the chosen files, as a translation key, or nothing when they are fine. */
export function checkFiles(
  files: File[],
  existing: number,
  limits: { maxBytes: number; maxCount: number; extensions: string[] },
): { key: string; values?: Record<string, string | number> } | undefined {
  if (existing + files.length > limits.maxCount) {
    return { key: 'attachments.tooMany', values: { count: limits.maxCount } };
  }
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!limits.extensions.includes(extension)) {
      return { key: 'attachments.notAllowed', values: { name: file.name } };
    }
    if (file.size > limits.maxBytes) {
      return {
        key: 'attachments.tooLarge',
        values: { name: file.name, size: formatSize(limits.maxBytes) },
      };
    }
  }
  return undefined;
}

/** True when the chosen files can be sent. */
export function useFilesProblem(files: File[], existing = 0) {
  const { data } = useAuthConfiguration({ query: { staleTime: 5 * 60_000 } });
  const limits = data?.data.attachments;
  return limits ? checkFiles(files, existing, limits) : undefined;
}
