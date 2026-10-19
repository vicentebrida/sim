// Generates the OpenAPI document without starting the server or connecting to the database; Orval
// consumes it in @sim/api-client. Runs from the SWC build: the decorator metadata Swagger uses to
// discover @Body() types does not exist when TypeScript is transpiled by esbuild/tsx.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { buildOpenApiDocument } from './openapi';

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: node dist/generate-openapi.js <output file>');
  process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi';
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  const document = buildOpenApiDocument(app);
  writeFileSync(resolve(target), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void main();
