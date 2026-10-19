import { defineConfig } from 'orval';

export default defineConfig({
  sim: {
    input: './openapi.json',
    output: {
      mode: 'tags-split',
      target: './src/generated/endpoints',
      schemas: './src/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: './src/fetcher.ts', name: 'simFetch' },
      },
    },
  },
});
