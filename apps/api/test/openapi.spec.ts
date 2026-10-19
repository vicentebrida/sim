import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { buildOpenApiDocument } from '../src/openapi';

describe('documento OpenAPI', () => {
  it('é gerado sem conflitos de schema e expõe as rotas com prefixo /api', async () => {
    process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi';
    const app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    const document = buildOpenApiDocument(app);
    await app.close();

    expect(Object.keys(document.paths)).toContain('/api/health');
    // Depende dos metadados de decorators (SWC); sem eles o corpo some do documento.
    expect(document.paths['/api/auth/login']?.post?.requestBody).toBeDefined();
  });

  it('descreve campos anuláveis como anuláveis, não como arrays (patch do nestjs-zod)', async () => {
    process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi';
    const app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    const document = buildOpenApiDocument(app);
    await app.close();

    const colaborador = document.components?.schemas?.['ColaboradorAtualDto_Output'] as {
      properties: Record<string, unknown>;
    };
    expect(colaborador.properties.departamento).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
  });
});
