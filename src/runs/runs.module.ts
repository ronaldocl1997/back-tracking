import { Module } from '@nestjs/common';
import { MyRunsController } from './my-runs.controller.js';
import { MyRunsService } from './my-runs.service.js';
import { RunGeneratorService } from './run-generator.service.js';
import { RunsController } from './runs.controller.js';
import { RunsScheduler } from './runs.scheduler.js';
import { RunsService } from './runs.service.js';

@Module({
  controllers: [RunsController, MyRunsController],
  providers: [RunGeneratorService, RunsService, MyRunsService, RunsScheduler],
})
export class RunsModule {}
