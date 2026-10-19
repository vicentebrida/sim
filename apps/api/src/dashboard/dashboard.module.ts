import { Module } from '@nestjs/common';
import { IdeasModule } from '../ideas/ideas.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [IdeasModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
