/** Turns texts into vectors. Any OpenAI-compatible `/embeddings` endpoint works (OpenAI, Ollama, ...). */
export abstract class EmbeddingProvider {
  /** One vector per text, in the same order. */
  abstract embed(texts: string[]): Promise<number[][]>;
}

export interface OpenAiCompatibleOptions {
  /** Base URL, e.g. https://api.openai.com/v1 or http://ollama:11434/v1 */
  url: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class OpenAiCompatibleProvider extends EmbeddingProvider {
  constructor(private readonly options: OpenAiCompatibleOptions) {
    super();
  }

  async embed(texts: string[]): Promise<number[][]> {
    const { url, model, apiKey, timeoutMs = 15_000 } = this.options;
    const response = await fetch(`${url.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`The embeddings service answered ${response.status}`);
    }
    const body = (await response.json()) as { data?: { index?: number; embedding?: number[] }[] };
    const data = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (data.length !== texts.length || data.some((item) => !Array.isArray(item.embedding))) {
      throw new Error('The embeddings service returned an unexpected answer');
    }
    return data.map((item) => item.embedding!);
  }
}
