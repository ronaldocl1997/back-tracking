import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import { idParam } from '../common/schemas.js';
import {
  createScheduleSchema,
  listRouteSchedulesQuerySchema,
  listSchedulesQuerySchema,
  myScheduleQuerySchema,
  updateScheduleSchema,
  type CreateScheduleDto,
  type ListRouteSchedulesQuery,
  type ListSchedulesQuery,
  type MyScheduleQuery,
  type UpdateScheduleDto,
} from './schedules.schemas.js';
import { SchedulesService } from './schedules.service.js';

/** Asignaciones semanales: ruta + día + chofer + acompañantes. */
@Can(AccessPolicy, 'manage')
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('routes/:routeId/schedules')
  findByRoute(
    @CurrentUser() user: AuthUser,
    @Param('routeId', { schema: idParam }) routeId: string,
    @Query({ schema: listRouteSchedulesQuerySchema })
    query: ListRouteSchedulesQuery,
  ) {
    return this.schedules.findByRoute(user, routeId, query);
  }

  @Post('routes/:routeId/schedules')
  create(
    @CurrentUser() user: AuthUser,
    @Param('routeId', { schema: idParam }) routeId: string,
    @Body({ schema: createScheduleSchema }) body: CreateScheduleDto,
  ) {
    return this.schedules.create(user, routeId, body);
  }

  @Get('schedules')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listSchedulesQuerySchema }) query: ListSchedulesQuery,
  ) {
    return this.schedules.findAll(user, query);
  }

  @Get('schedules/:id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.schedules.findOne(user, id);
  }

  @Patch('schedules/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateScheduleSchema }) body: UpdateScheduleDto,
  ) {
    return this.schedules.update(user, id, body);
  }

  @Delete('schedules/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.schedules.remove(user, id);
  }
}

/** Vista del empleado (chofer o acompañante) sobre su propia semana. */
@Can(AccessPolicy, 'employee')
@Controller('my')
export class MyScheduleController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('schedules')
  mySchedule(
    @CurrentUser() user: AuthUser,
    @Query({ schema: myScheduleQuerySchema }) query: MyScheduleQuery,
  ) {
    return this.schedules.mySchedule(user, query);
  }
}
