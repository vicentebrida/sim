import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { viewerLocaleMiddleware } from './common/viewer-locale';

export const API_PREFIX = 'api';

/** HTTP setup shared by the server, the tests and the OpenAPI generation. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.getHttpAdapter().getInstance().set('trust proxy', app.get<Env>(ENV).SIM_TRUST_PROXY);
  app.use(cookieParser());
  app.use(viewerLocaleMiddleware);
  app.enableShutdownHooks();
}
