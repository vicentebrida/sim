/** Postgres unique constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: unknown })?.cause ?? error;
  return (cause as { code?: unknown })?.code === '23505';
}
