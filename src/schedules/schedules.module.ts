import { Module } from '@nestjs/common';
import {
  MyScheduleController,
  SchedulesController,
} from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  controllers: [SchedulesController, MyScheduleController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
