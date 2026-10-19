import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';

@Global()
@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [BrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
