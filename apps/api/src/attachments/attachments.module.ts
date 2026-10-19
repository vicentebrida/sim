import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { IdeasModule } from '../ideas/ideas.module';
import { AttachmentStore } from './attachment-store';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { DiskStorage, FileStorage } from './file-storage';

/** Read side and file cleanup, used by Ideas and Comments without depending on the upload side. */
@Global()
@Module({
  providers: [
    AttachmentStore,
    {
      provide: FileStorage,
      inject: [ENV],
      useFactory: (env: Env) => new DiskStorage(env.SIM_DATA_DIR),
    },
  ],
  exports: [AttachmentStore, FileStorage],
})
export class AttachmentStoreModule {}

@Module({
  imports: [
    IdeasModule,
    MulterModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        storage: memoryStorage(),
        limits: { fileSize: env.SIM_ATTACHMENT_MAX_MB * 1024 * 1024, files: 1 },
      }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
