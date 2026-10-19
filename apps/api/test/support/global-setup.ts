import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Um único Postgres para toda a suíte; cada arquivo de teste cria o próprio banco (ver app.ts).
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
  project.provide('postgresUri', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUri: string;
  }
}
