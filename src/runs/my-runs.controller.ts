import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  ApiDoc,
  ApiError,
  ApiOk,
  ApiProtectedController,
} from '../common/openapi/decorators.js';
import { idParam } from '../common/schemas.js';
import { TAGS } from '../swagger.js';
import {
  checkInSchema,
  myRunsQuerySchema,
  skipVisitSchema,
  type CheckInDto,
  type MyRunsQuery,
  type SkipVisitDto,
} from './runs.schemas.js';
import { MyRunsService } from './my-runs.service.js';

const EMPLOYEE: ['EMPLOYEE'] = ['EMPLOYEE'];

/** App del chofer y del acompañante. */
@Can(AccessPolicy, 'employee')
@ApiProtectedController(TAGS.my)
@Controller('my/runs')
export class MyRunsController {
  constructor(private readonly runs: MyRunsService) {}

  @Get()
  @ApiDoc('Mis recorridos de hoy', {
    roles: EMPLOYEE,
    description:
      'Pantalla principal de la app. Recorridos de hoy (o de `date`) donde el usuario es chofer o acompañante (`myRole`), ' +
      'con los clientes en orden, acompañantes y avance. Si aún no se habían generado los de hoy, se generan en este momento.\n\n' +
      '**Flujo del chofer:** `start` → enviar posiciones a `POST /tracking/pings` → (opcional) `check-in` / `skip` → `finish`.',
  })
  @ApiOk('MyRun', { array: true })
  @ApiError(400)
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: myRunsQuerySchema }) query: MyRunsQuery,
  ) {
    return this.runs.list(user, query);
  }

  @Get(':id')
  @ApiDoc('Ver uno de mis recorridos', { roles: EMPLOYEE })
  @ApiOk('MyRun')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.findOne(user, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @ApiDoc('Iniciar recorrido', {
    roles: EMPLOYEE,
    description:
      'Solo el chofer, el mismo día del recorrido, y sin otro recorrido en curso (un chofer con varias rutas el mismo día las hace una tras otra). ' +
      'A partir de aquí acepta posiciones.',
  })
  @ApiOk('MyRun')
  @ApiError(404, 'No existe o no eres su chofer')
  @ApiError(409, 'Ya iniciado o terminado, no es hoy, o tienes otro recorrido en curso')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.start(user, id);
  }

  @Post(':id/finish')
  @HttpCode(200)
  @ApiDoc('Terminar recorrido', {
    roles: EMPLOYEE,
    description:
      'Queda `COMPLETED`. Las visitas pendientes pasan a `MISSED`, salvo si el chofer sigue dentro del radio de un cliente: esa cuenta como visitada. ' +
      'Envía las posiciones pendientes **antes** de terminar.',
  })
  @ApiOk('MyRun')
  @ApiError(404, 'No existe o no eres su chofer')
  @ApiError(409, 'El recorrido no está en curso')
  finish(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.runs.finish(user, id);
  }

  @Post(':runId/visits/:visitId/check-in')
  @HttpCode(200)
  @ApiDoc('Check-in manual ("Llegué")', {
    roles: EMPLOYEE,
    description:
      'Para cuando la detección automática no la marcó (GPS débil bajo techo). Envía la posición actual. ' +
      'Dentro del radio del cliente: `VISITED`. Fuera: también `VISITED`, pero con `flagged: true` para que el supervisor la revise.',
  })
  @ApiOk('Visit')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'El recorrido no está en curso o la visita ya fue registrada')
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
  @ApiDoc('Saltar un cliente', {
    roles: EMPLOYEE,
    description: 'Cliente cerrado, no quiso recibir, etc. Queda `SKIPPED` con el motivo en `notes`.',
  })
  @ApiOk('Visit')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'El recorrido no está en curso o la visita ya fue registrada')
  skip(
    @CurrentUser() user: AuthUser,
    @Param('runId', { schema: idParam }) runId: string,
    @Param('visitId', { schema: idParam }) visitId: string,
    @Body({ schema: skipVisitSchema }) body: SkipVisitDto,
  ) {
    return this.runs.skip(user, runId, visitId, body);
  }
}
