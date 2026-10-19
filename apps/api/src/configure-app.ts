import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

export const API_PREFIX = 'api';

/** Configuração HTTP comum ao servidor, aos testes e à geração do OpenAPI. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.getHttpAdapter().getInstance().set('trust proxy', app.get<Env>(ENV).SIM_TRUST_PROXY);
  app.use(cookieParser());
  app.enableShutdownHooks();
}
