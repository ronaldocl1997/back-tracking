import { Module } from '@nestjs/common';
import { PingRetentionScheduler } from './ping-retention.scheduler.js';
import { TrackingController } from './tracking.controller.js';
import { TrackingService } from './tracking.service.js';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, PingRetentionScheduler],
})
export class TrackingModule {}
