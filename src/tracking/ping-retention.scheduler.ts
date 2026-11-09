import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Env } from '../config/env.schema.js';

const BATCH_SIZE = 10_000;

/**
 * Borra las posiciones GPS más antiguas que PING_RETENTION_DAYS (0 = nunca).
 * Solo el trazo detallado: recorridos y visitas se conservan siempre, así que
 * los reportes de días viejos siguen funcionando, aunque sin dibujar el camino.
 * Borra en tandas para no bloquear la tabla.
 */
@Injectable()
export class PingRetentionScheduler {
  private readonly logger = new Logger(PingRetentionScheduler.name);
  private readonly days: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.days = config.get('PING_RETENTION_DAYS', { infer: true });
  }

  @Cron('30 3 * * *', { name: 'ping-retention' })
  async purge(): Promise<number> {
    if (this.days === 0) return 0;
    const cutoff = new Date(Date.now() - this.days * 86_400_000);

    let total = 0;
    for (;;) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM "LocationPing"
        WHERE id IN (
          SELECT id FROM "LocationPing"
          WHERE "recordedAt" < ${cutoff}
          LIMIT ${BATCH_SIZE}
        )`;
      total += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    if (total > 0) {
      this.logger.log(
        `${total} posiciones de más de ${this.days} días eliminadas`,
      );
    }
    return total;
  }
}
