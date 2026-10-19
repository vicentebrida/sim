import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import type { Pool } from 'pg';
import { AppModule } from './app.module';
import { EmergencyAccountService } from './collaborators/emergency-account.service';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { PG_POOL } from './database/database.module';
import { runMigrations } from './database/migrate';
import { API_PREFIX, configureApp } from './configure-app';
import { buildOpenApiDocument } from './openapi';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);

  if (env.SIM_MIGRATE_ON_START) {
    await runMigrations(app.get<Pool>(PG_POOL));
    logger.log('Migrations applied');
  }
  await app.get(EmergencyAccountService).ensure();

  if (env.SIM_MODE === 'worker') {
    // Background jobs arrive in Milestone 2 (ADR-0006); for now the worker only keeps the process alive.
    await app.init();
    logger.log('SIM started in worker mode');
    return;
  }

  configureApp(app);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => buildOpenApiDocument(app));
  await app.listen(env.PORT);
  logger.log(`SIM listening on port ${env.PORT} (${env.SIM_MODE} mode)`);
}

void bootstrap();
