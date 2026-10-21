import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HEARTBEAT_MS, RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, { provide: HEARTBEAT_MS, useValue: 30_000 }],
})
export class RealtimeModule {}
