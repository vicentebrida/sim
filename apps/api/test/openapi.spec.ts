import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { buildOpenApiDocument } from '../src/openapi';

async function document() {
  process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi';
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  const built = buildOpenApiDocument(app);
  await app.close();
  return built;
}

describe('OpenAPI document', () => {
  it('is generated without schema conflicts and exposes the routes under /api', async () => {
    const built = await document();
    expect(Object.keys(built.paths)).toContain('/api/health');
    // Depends on decorator metadata (SWC); without it the body disappears from the document.
    expect(built.paths['/api/auth/login']?.post?.requestBody).toBeDefined();
  });

  it('describes nullable fields as nullable, not as arrays (nestjs-zod patch)', async () => {
    const built = await document();
    const collaborator = built.components?.schemas?.['CurrentCollaboratorDto_Output'] as {
      properties: Record<string, unknown>;
    };
    expect(collaborator.properties.department).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
  });
});
