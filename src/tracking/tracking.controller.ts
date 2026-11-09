import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { SkipThrottle } from '@nestjs/throttler';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  liveQuerySchema,
  pingBatchSchema,
  type LiveQuery,
  type PingBatchDto,
} from './tracking.schemas.js';
import { TrackingService } from './tracking.service.js';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /**
   * Lote de posiciones del chofer. Responde cuántas se aceptaron y las visitas
   * que cambiaron, para que la app actualice la pantalla.
   * Sin límite de frecuencia: al recuperar señal la app puede vaciar su cola de golpe.
   */
  @Can(AccessPolicy, 'employee')
  @SkipThrottle()
  @Post('pings')
  @HttpCode(200)
  ingest(
    @CurrentUser() user: AuthUser,
    @Body({ schema: pingBatchSchema }) body: PingBatchDto,
  ) {
    return this.tracking.ingest(user, body);
  }

  /** Mapa en vivo: última posición de cada chofer en ruta. */
  @Can(AccessPolicy, 'manage')
  @Get('live')
  live(
    @CurrentUser() user: AuthUser,
    @Query({ schema: liveQuerySchema }) query: LiveQuery,
  ) {
    return this.tracking.live(user, query);
  }
}
