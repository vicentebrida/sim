import { existsSync } from 'node:fs';
import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AttachmentsModule, AttachmentStoreModule } from './attachments/attachments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BrandingModule } from './branding/branding.module';
import { SemanticModule } from './semantic/semantic.module';
import { SettingsModule } from './settings/settings.module';
import { StatusesModule } from './statuses/statuses.module';
import { CategoriesModule } from './categories/categories.module';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { CommentsModule } from './comments/comments.module';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ConfigModule } from './config/config.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdeasModule } from './ideas/ideas.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';

// In production the same image serves the SPA; non-API routes fall back to index.html.
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
    CollaboratorsModule,
    AuthModule,
    CategoriesModule,
    CustomFieldsModule,
    IdeasModule,
    CommentsModule,
    NotificationsModule,
    JobsModule,
    DashboardModule,
    AttachmentStoreModule,
    AttachmentsModule,
    BrandingModule,
    StatusesModule,
    AuditModule,
    SettingsModule,
    SemanticModule,
    ...webModule(),
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
