/**
 * Menções ficam no texto do Comentário como `@[Nome](id)`: o frontend mostra só "@Nome" e o id
 * identifica a pessoa mesmo que dois Colaboradores tenham o mesmo nome.
 */
const MARCACAO =
  /@\[([^\]\n]{1,120})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export function idsMencionados(texto: string): string[] {
  return [...new Set([...texto.matchAll(MARCACAO)].map((marcacao) => marcacao[2]!.toLowerCase()))];
}

/**
 * Atualiza o nome de cada Colaborador mencionado e transforma em texto simples as Menções a quem
 * não pode ser mencionado (inexistente ou inativo).
 */
export function normalizarMencoes(texto: string, mencionaveis: ReadonlyMap<string, string>) {
  const mencionados = new Set<string>();
  const normalizado = texto.replace(MARCACAO, (_marcacao, nome: string, id: string) => {
    const atual = mencionaveis.get(id.toLowerCase());
    if (!atual) return `@${nome}`;
    mencionados.add(id.toLowerCase());
    return `@[${atual}](${id.toLowerCase()})`;
  });
  return { texto: normalizado, mencionados: [...mencionados] };
}
