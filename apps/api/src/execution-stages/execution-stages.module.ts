import { Global, Module } from '@nestjs/common';
import { ExecutionStagesController } from './execution-stages.controller';
import { ExecutionStagesService } from './execution-stages.service';

@Global()
@Module({
  controllers: [ExecutionStagesController],
  providers: [ExecutionStagesService],
  exports: [ExecutionStagesService],
})
export class ExecutionStagesModule {}
