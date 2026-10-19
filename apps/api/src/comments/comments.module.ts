import { Module } from '@nestjs/common';
import { IdeasModule } from '../ideas/ideas.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [IdeasModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
