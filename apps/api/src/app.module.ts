import { existsSync } from 'node:fs';
import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from './auth/auth.module';
import { CamposPersonalizadosModule } from './campos-personalizados/campos-personalizados.module';
import { CategoriasModule } from './categorias/categorias.module';
import { ColaboradoresModule } from './colaboradores/colaboradores.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdeiasModule } from './ideias/ideias.module';

// Em produção a mesma imagem serve a SPA; rotas que não são da API caem no index.html.
function webModule(): DynamicModule[] {
  const rootPath = process.env.SIM_WEB_DIST;
  if (!rootPath || !existsSync(rootPath)) return [];
  return [ServeStaticModule.forRoot({ rootPath, exclude: ['/api/{*path}'] })];
}

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    ColaboradoresModule,
    AuthModule,
    CategoriasModule,
    CamposPersonalizadosModule,
    IdeiasModule,
    ...webModule(),
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
