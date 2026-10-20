import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, type Pool } from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { EmergencyAccountService } from '../../src/collaborators/emergency-account.service';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { runMigrations } from '../../src/database/migrate';
import { EmbeddingProvider } from '../../src/semantic/embedding-provider';
import { Mailer } from '../../src/notifications/email/mailer';

export const EMERGENCY = { email: 'emergency@sim.test', password: 'emergency-password-123' };

export interface TestApp {
  app: INestApplication;
  pool: Pool;
  http: () => ReturnType<typeof request>;
  /** HTTP client that keeps cookies between requests, like a browser. */
  browser: () => ReturnType<typeof request.agent>;
  close: () => Promise<void>;
}

export type Browser = ReturnType<TestApp['browser']>;

async function createDatabase(): Promise<string> {
  const base = new URL(inject('postgresUri'));
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const client = new Client({ connectionString: base.toString() });
  await client.connect();
  await client.query(`CREATE DATABASE ${name}`);
  await client.end();
  base.pathname = `/${name}`;
  return base.toString();
}

/** Starts the whole SIM against a fresh database, with the emergency account configured. */
export async function createApp(
  env: Record<string, string> = {},
  overrides: { mailer?: Mailer; embeddings?: EmbeddingProvider } = {},
): Promise<TestApp> {
  const originalEnv = { ...process.env };
  Object.assign(process.env, {
    DATABASE_URL: await createDatabase(),
    SIM_PUBLIC_URL: 'http://localhost:3000',
    SIM_DATA_DIR: mkdtempSync(join(tmpdir(), 'sim-test-')),
    SIM_EMERGENCY_EMAIL: EMERGENCY.email,
    SIM_EMERGENCY_PASSWORD: EMERGENCY.password,
    ...env,
  });

  try {
    const builder = Test.createTestingModule({ imports: [AppModule] });
    if (overrides.mailer) builder.overrideProvider(Mailer).useValue(overrides.mailer);
    if (overrides.embeddings) {
      builder.overrideProvider(EmbeddingProvider).useValue(overrides.embeddings);
    }
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    const pool = app.get<Pool>(PG_POOL);
    await runMigrations(pool);
    await app.get(EmergencyAccountService).ensure();
    await app.init();

    return {
      app,
      pool,
      http: () => request(app.getHttpServer()),
      browser: () => request.agent(app.getHttpServer()),
      close: () => app.close(),
    };
  } finally {
    process.env = originalEnv;
  }
}

/** Browser signed in with the emergency account (Administrator). */
export async function signInAsAdministrator(sim: TestApp) {
  const browser = sim.browser();
  await browser
    .post('/api/auth/login')
    .send({ email: EMERGENCY.email, password: EMERGENCY.password })
    .expect(200);
  return browser;
}

/** Creates a local account through the Administrator and returns a browser with a final password. */
export async function createCollaborator(
  sim: TestApp,
  admin: Browser,
  name: string,
  options: { administrator?: boolean } = {},
) {
  const user = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.');
  const email = `${user}@company.test`;
  const account = await admin
    .post('/api/collaborators')
    .send({ name, email, ...options })
    .expect(201);
  const browser = sim.browser();
  await browser
    .post('/api/auth/login')
    .send({ email, password: account.body.temporaryPassword })
    .expect(200);
  await browser
    .post('/api/auth/change-password')
    .send({
      currentPassword: account.body.temporaryPassword,
      newPassword: `password-of-${name}-123`,
    })
    .expect(204);
  return { browser, id: account.body.collaborator.id as string };
}
