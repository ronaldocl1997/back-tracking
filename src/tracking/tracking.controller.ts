import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { SkipThrottle } from '@nestjs/throttler';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  ApiDoc,
  ApiError,
  ApiOk,
  ApiProtectedController,
} from '../common/openapi/decorators.js';
import { TAGS } from '../swagger.js';
import {
  liveQuerySchema,
  pingBatchSchema,
  type LiveQuery,
  type PingBatchDto,
} from './tracking.schemas.js';
import { TrackingService } from './tracking.service.js';

@ApiProtectedController(TAGS.tracking)
@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Can(AccessPolicy, 'employee')
  @SkipThrottle()
  @Post('pings')
  @HttpCode(200)
  @ApiDoc('Enviar posiciones GPS (lote)', {
    roles: ['EMPLOYEE'],
    description:
      'Solo el **chofer** del recorrido, mientras está en curso. El backend guarda las posiciones y decide las visitas.\n\n' +
      '**Cómo debe enviarlas la app:**\n' +
      '- Tomar una posición cada 15–30 s en movimiento (60 s detenido) y enviar cada 30–60 s o al juntar 10.\n' +
      '- Cada posición lleva un `id` UUID generado en el celular: si un lote se reenvía, no se duplica nada.\n' +
      '- `recordedAt` es cuándo se tomó (con zona horaria), no cuándo se envía.\n' +
      '- Sin señal: guardarlas y enviarlas al recuperar conexión, de la más vieja a la más nueva. Hasta 500 por lote.\n\n' +
      '**Qué decide el backend:**\n' +
      '- Visita confirmada (`VISITED`, `AUTO_GEOFENCE`) tras 2 min seguidos dentro del radio del cliente; pasar de largo no cuenta.\n' +
      '- Lecturas con precisión peor que 50 m se guardan pero no deciden visitas.\n' +
      '- Se rechazan lecturas del futuro o de más de 5 min antes de iniciar; tras terminar, solo se aceptan las tomadas antes del fin.\n\n' +
      'La respuesta trae solo las visitas que cambiaron, para actualizar la pantalla.',
  })
  @ApiOk('PingBatchResult')
  @ApiError(400)
  @ApiError(404, 'El recorrido no existe o no eres su chofer')
  @ApiError(409, 'El recorrido no está en curso')
  ingest(
    @CurrentUser() user: AuthUser,
    @Body({ schema: pingBatchSchema }) body: PingBatchDto,
  ) {
    return this.tracking.ingest(user, body);
  }

  @Can(AccessPolicy, 'manage')
  @Get('live')
  @ApiDoc('Mapa en vivo', {
    roles: ['ADMIN', 'PROVIDER', 'SUPERVISOR'],
    description:
      'Última posición de cada chofer con recorrido en curso, con su avance. `signalLost: true` si lleva más de 5 minutos sin enviar. ' +
      'Consúltalo cada 10–15 s para refrescar el mapa.',
  })
  @ApiOk('LiveRun', { array: true })
  @ApiError(400)
  live(
    @CurrentUser() user: AuthUser,
    @Query({ schema: liveQuerySchema }) query: LiveQuery,
  ) {
    return this.tracking.live(user, query);
  }
}
