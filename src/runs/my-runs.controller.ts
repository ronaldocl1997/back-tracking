import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import { idParam } from '../common/schemas.js';
import {
  checkInSchema,
  myRunsQuerySchema,
  skipVisitSchema,
  type CheckInDto,
  type MyRunsQuery,
  type SkipVisitDto,
} from './runs.schemas.js';
import { MyRunsService } from './my-runs.service.js';

/** App del chofer y del acompañante. */
@Can(AccessPolicy, 'employee')
@Controller('my/runs')
export class MyRunsController {
  constructor(private readonly runs: MyRunsService) {}

  /** Recorridos de hoy (o de `?date=YYYY-MM-DD`), con clientes, acompañantes y avance. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: myRunsQuerySchema }) query: MyRunsQuery,
  ) {
    return this.runs.list(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.findOne(user, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.start(user, id);
  }

  @Post(':id/finish')
  @HttpCode(200)
  finish(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.finish(user, id);
  }

  @Post(':runId/visits/:visitId/check-in')
  @HttpCode(200)
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('runId', { schema: idParam }) runId: string,
    @Param('visitId', { schema: idParam }) visitId: string,
    @Body({ schema: checkInSchema }) body: CheckInDto,
  ) {
    return this.runs.checkIn(user, runId, visitId, body);
  }

  @Post(':runId/visits/:visitId/skip')
  @HttpCode(200)
  skip(
    @CurrentUser() user: AuthUser,
    @Param('runId', { schema: idParam }) runId: string,
    @Param('visitId', { schema: idParam }) visitId: string,
    @Body({ schema: skipVisitSchema }) body: SkipVisitDto,
  ) {
    return this.runs.skip(user, runId, visitId, body);
  }
}
