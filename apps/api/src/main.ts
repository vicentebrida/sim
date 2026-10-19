import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import type { Pool } from 'pg';
import { AppModule } from './app.module';
import { ContaDeEmergenciaService } from './colaboradores/conta-de-emergencia.service';
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
    logger.log('Migrations aplicadas');
  }
  await app.get(ContaDeEmergenciaService).garantir();

  if (env.SIM_MODE === 'worker') {
    // Jobs em segundo plano chegam no Marco 2 (ADR-0006); por ora o worker só mantém o processo vivo.
    await app.init();
    logger.log('SIM iniciado em modo worker');
    return;
  }

  configureApp(app);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => buildOpenApiDocument(app));
  await app.listen(env.PORT);
  logger.log(`SIM ouvindo na porta ${env.PORT} (modo ${env.SIM_MODE})`);
}

void bootstrap();
