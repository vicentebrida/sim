import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// A single Postgres for the whole suite; each test file creates its own database (see app.ts).
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
