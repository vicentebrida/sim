import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';

// A single Postgres for the whole suite; each test file creates its own database (see app.ts).
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
  const redis = await new RedisContainer('redis:7-alpine').start();
  project.provide('postgresUri', container.getConnectionUri());
  project.provide('redisUrl', redis.getConnectionUrl());
  return async () => {
    await redis.stop();
    await container.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUri: string;
    redisUrl: string;
  }
}
