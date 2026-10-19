import { Global, Module } from '@nestjs/common';
import { StatusesController } from './statuses.controller';
import { StatusesService } from './statuses.service';

@Global()
@Module({
  controllers: [StatusesController],
  providers: [StatusesService],
  exports: [StatusesService],
})
export class StatusesModule {}
