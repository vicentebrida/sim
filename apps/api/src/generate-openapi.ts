// Gera o OpenAPI sem subir o servidor nem conectar ao banco; consumido pelo Orval em @sim/api-client.
// Roda a partir do build (SWC): os metadados de decorators que o Swagger usa para descobrir os
// tipos de @Body() não existem quando o TypeScript é transpilado por esbuild/tsx.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { buildOpenApiDocument } from './openapi';

async function main() {
  const destino = process.argv[2];
  if (!destino) throw new Error('Uso: node dist/generate-openapi.js <arquivo de saída>');
  process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi';
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  const document = buildOpenApiDocument(app);
  writeFileSync(resolve(destino), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void main();
