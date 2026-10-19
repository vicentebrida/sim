/**
 * Menções viajam na API como `@[Nome](id)`. Na tela e no editor aparecem como "@Nome"; ao enviar,
 * as Menções escolhidas na lista de sugestões voltam a ser marcação.
 */
export interface Mencionado {
  id: string;
  nome: string;
}

export type Segmento = { tipo: 'texto'; valor: string } | ({ tipo: 'mencao' } & Mencionado);

const MARCACAO = /@\[([^\]\n]+)\]\(([0-9a-f-]{36})\)/gi;

export function segmentar(texto: string): Segmento[] {
  const segmentos: Segmento[] = [];
  let posicao = 0;
  for (const marcacao of texto.matchAll(MARCACAO)) {
    if (marcacao.index > posicao) {
      segmentos.push({ tipo: 'texto', valor: texto.slice(posicao, marcacao.index) });
    }
    segmentos.push({ tipo: 'mencao', nome: marcacao[1]!, id: marcacao[2]! });
    posicao = marcacao.index + marcacao[0].length;
  }
  if (posicao < texto.length) segmentos.push({ tipo: 'texto', valor: texto.slice(posicao) });
  return segmentos;
}

/** Texto para o editor ("@Nome") e as Menções que ele contém. */
export function paraEdicao(texto: string): { texto: string; mencionados: Mencionado[] } {
  const mencionados = new Map<string, Mencionado>();
  const simples = segmentar(texto)
    .map((segmento) => {
      if (segmento.tipo === 'texto') return segmento.valor;
      mencionados.set(segmento.id, { id: segmento.id, nome: segmento.nome });
      return `@${segmento.nome}`;
    })
    .join('');
  return { texto: simples, mencionados: [...mencionados.values()] };
}

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Volta "@Nome" para `@[Nome](id)`, só para quem foi escolhido e continua citado no texto. */
export function paraEnvio(texto: string, mencionados: readonly Mencionado[]): string {
  // Nomes mais longos primeiro, para "@Ana Souza" não ser capturada como "@Ana".
  const porTamanho = [...mencionados].sort((a, b) => b.nome.length - a.nome.length);
  if (!porTamanho.length) return texto;
  const padrao = new RegExp(
    `@(${porTamanho.map(({ nome }) => escaparRegex(nome)).join('|')})(?![\\p{L}\\p{N}])`,
    'gu',
  );
  return texto.replace(padrao, (trecho, nome: string) => {
    const mencionado = porTamanho.find((m) => m.nome === nome);
    return mencionado ? `@[${mencionado.nome}](${mencionado.id})` : trecho;
  });
}
