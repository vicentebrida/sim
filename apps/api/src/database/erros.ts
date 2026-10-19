/** Violação de restrição de unicidade do Postgres (SQLSTATE 23505). */
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const causa = (erro as { cause?: unknown })?.cause ?? erro;
  return (causa as { code?: unknown })?.code === '23505';
}
