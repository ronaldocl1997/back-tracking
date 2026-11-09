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
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  ApiDoc,
  ApiError,
  ApiOk,
  ApiPaginated,
  ApiProtectedController,
} from '../common/openapi/decorators.js';
import { idParam } from '../common/schemas.js';
import { TAGS } from '../swagger.js';
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

const MANAGE: ['ADMIN', 'PROVIDER', 'SUPERVISOR'] = ['ADMIN', 'PROVIDER', 'SUPERVISOR'];

/** Monitoreo y control de los recorridos diarios (ADMIN, dueño, supervisor). */
@Can(AccessPolicy, 'manage')
@ApiProtectedController(TAGS.runs)
@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  @ApiDoc('Listar recorridos', {
    roles: MANAGE,
    description:
      'Cada recorrido es una ruta hecha por un chofer en un día, con su avance (visitados, perdidos, saltados, marcados).\n\n' +
      '- Un día: `date=2026-11-17`; un rango: `dateFrom` y `dateTo` (no ambos).\n' +
      '- `search=jose` busca por nombre del chofer o de la ruta.\n' +
      '- `driverId`: donde manejó; `employeeId`: donde participó como chofer o acompañante.\n' +
      '- `hasFlagged=true`: con visitas pendientes de revisión.',
  })
  @ApiPaginated('RunListItem')
  @ApiError(400)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listRunsQuerySchema }) query: ListRunsQuery,
  ) {
    return this.runs.findAll(user, query);
  }

  @Post('generate')
  @HttpCode(200)
  @ApiDoc('Generar recorridos de un día', {
    roles: MANAGE,
    description:
      'Crea los recorridos de esa fecha a partir de las asignaciones semanales. Normalmente lo hace solo un job cada 15 minutos; ' +
      'esto sirve para adelantarlos o regenerarlos tras cambiar asignaciones. **No duplica** los que ya existen. ' +
      'El ADMIN sin `providerId` genera para todos los proveedores.',
  })
  @ApiOk('GenerationResult', { array: true })
  @ApiError(400)
  generate(
    @CurrentUser() user: AuthUser,
    @Body({ schema: generateRunsSchema }) body: GenerateRunsDto,
  ) {
    return this.runs.generate(user, body);
  }

  @Get(':id')
  @ApiDoc('Ver un recorrido', {
    roles: MANAGE,
    description: 'Con cada visita (llegada, salida, distancia, método, revisión), acompañantes, última posición y avance.',
  })
  @ApiOk('RunDetail')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.findOne(user, id);
  }

  @Get(':id/map')
  @ApiDoc('Mapa del recorrido', {
    roles: MANAGE,
    description:
      'Todo para dibujarlo en una llamada:\n\n' +
      '- `track.points`: la línea del camino real, en orden (reducida a `maxPoints`).\n' +
      '- `stops`: un marcador por cliente con su `status`; `actualOrder` vs `sequence` muestra si siguió el orden planeado; `minutesOnSite`.\n' +
      '- `summary`: avance, km recorridos, duración y si siguió el orden.\n' +
      '- `bounds`: recuadro para encuadrar el mapa.\n\n' +
      'Si el trazo de un día viejo ya se borró por retención, `track.points` viene vacío pero las visitas siguen.',
  })
  @ApiOk('RunMap')
  @ApiError(400)
  @ApiError(404)
  map(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Query({ schema: mapQuerySchema }) query: MapQuery,
  ) {
    return this.runs.map(user, id, query);
  }

  /** Reemplazado por /map; se mantiene por compatibilidad, fuera de la documentación. */
  @ApiExcludeEndpoint()
  @Get(':id/track')
  track(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Query({ schema: trackQuerySchema }) query: TrackQuery,
  ) {
    return this.runs.track(user, id, query);
  }

  @Patch(':id')
  @ApiDoc('Cambios del día', {
    roles: MANAGE,
    description:
      'Para lo que cambia solo hoy, sin tocar el plan semanal:\n\n' +
      '- `driverId`: otro chofer, solo si el recorrido no ha iniciado (409 si ya inició).\n' +
      '- `companions`: acompañantes reales; `attended: false` registra que faltó. Reemplaza la lista completa.',
  })
  @ApiOk('RunDetail')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'El recorrido ya inició (no se cambia el chofer) o ya terminó')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateRunSchema }) body: UpdateRunDto,
  ) {
    return this.runs.update(user, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiDoc('Cancelar recorrido', {
    roles: MANAGE,
    description: 'Queda `CANCELLED` y sus visitas pendientes pasan a `SKIPPED` con la nota "Recorrido cancelado".',
  })
  @ApiOk('RunDetail')
  @ApiError(404)
  @ApiError(409, 'El recorrido ya terminó')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.cancel(user, id);
  }

  @Patch(':runId/visits/:visitId')
  @ApiDoc('Revisar o corregir una visita', {
    roles: MANAGE,
    description:
      'Aprobar un check-in marcado (`flagged: false`), corregir el estado (por ejemplo MISSED → VISITED tras confirmar por teléfono) ' +
      'o anotarla. Queda registrado quién y cuándo (`reviewedBy`, `reviewedAt`).',
  })
  @ApiOk('Visit')
  @ApiError(400)
  @ApiError(404)
  reviewVisit(
    @CurrentUser() user: AuthUser,
    @Param('runId', { schema: idParam }) runId: string,
    @Param('visitId', { schema: idParam }) visitId: string,
    @Body({ schema: reviewVisitSchema }) body: ReviewVisitDto,
  ) {
    return this.runs.reviewVisit(user, runId, visitId, body);
  }
}
