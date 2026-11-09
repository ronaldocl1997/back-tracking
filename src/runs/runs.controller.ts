import {
  Body,
  Controller,
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
  generateRunsSchema,
  listRunsQuerySchema,
  mapQuerySchema,
  reviewVisitSchema,
  trackQuerySchema,
  updateRunSchema,
  type GenerateRunsDto,
  type ListRunsQuery,
  type MapQuery,
  type ReviewVisitDto,
  type TrackQuery,
  type UpdateRunDto,
} from './runs.schemas.js';
import { RunsService } from './runs.service.js';

/** Monitoreo y control de los recorridos diarios (ADMIN, dueño, supervisor). */
@Can(AccessPolicy, 'manage')
@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listRunsQuerySchema }) query: ListRunsQuery,
  ) {
    return this.runs.findAll(user, query);
  }

  /** Genera a mano los recorridos de un día (no duplica los que ya existen). */
  @Post('generate')
  @HttpCode(200)
  generate(
    @CurrentUser() user: AuthUser,
    @Body({ schema: generateRunsSchema }) body: GenerateRunsDto,
  ) {
    return this.runs.generate(user, body);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.findOne(user, id);
  }

  /** Trazo, clientes con resultado y tiempos, y resumen: todo para dibujar el mapa. */
  @Get(':id/map')
  map(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Query({ schema: mapQuerySchema }) query: MapQuery,
  ) {
    return this.runs.map(user, id, query);
  }

  @Get(':id/track')
  track(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Query({ schema: trackQuerySchema }) query: TrackQuery,
  ) {
    return this.runs.track(user, id, query);
  }

  /** Cambios del día: otro chofer (si no ha iniciado) y/o acompañantes reales. */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateRunSchema }) body: UpdateRunDto,
  ) {
    return this.runs.update(user, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.cancel(user, id);
  }

  /** Aprobar una visita marcada, corregir su estado o anotarla. */
  @Patch(':runId/visits/:visitId')
  reviewVisit(
    @CurrentUser() user: AuthUser,
    @Param('runId', { schema: idParam }) runId: string,
    @Param('visitId', { schema: idParam }) visitId: string,
    @Body({ schema: reviewVisitSchema }) body: ReviewVisitDto,
  ) {
    return this.runs.reviewVisit(user, runId, visitId, body);
  }
}
