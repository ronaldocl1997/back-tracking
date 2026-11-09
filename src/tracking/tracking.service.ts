import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { providerScope } from '../auth/provider-scope.js';
import type { Env } from '../config/env.schema.js';
import { runProgress } from '../runs/run-progress.js';
import type { LiveQuery, PingBatchDto, PingDto } from './tracking.schemas.js';
import { detectVisits, type DetectorOptions } from './visit-detector.js';

/** Margen antes de `startedAt`: el celular pudo empezar a medir un poco antes. */
const START_GRACE_MS = 5 * 60_000;
/** Sin posiciones en este tiempo, el mapa en vivo marca "sin señal". */
const SIGNAL_LOST_MS = 5 * 60_000;

@Injectable()
export class TrackingService {
  private readonly detector: DetectorOptions;
  private readonly maxFutureSkewMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.detector = {
      dwellMs: config.get('VISIT_DWELL_SECONDS', { infer: true }) * 1000,
      maxAccuracyM: config.get('VISIT_MAX_ACCURACY_M', { infer: true }),
    };
    this.maxFutureSkewMs =
      config.get('PING_MAX_FUTURE_SKEW_SECONDS', { infer: true }) * 1000;
  }

  /**
   * Recibe un lote de posiciones del chofer:
   * 1. Solo el chofer del recorrido; en curso, o ya terminado si son posiciones
   *    atrasadas (sin señal) de antes de terminar.
   * 2. Descarta lecturas fuera de la ventana del recorrido o del futuro.
   * 3. Guarda (los `id` repetidos se ignoran) y actualiza la última posición.
   * 4. Si está en curso, evalúa llegadas/salidas con las posiciones nuevas.
   */
  async ingest(user: AuthUser, { routeRunId, pings }: PingBatchDto) {
    const employeeIds = user.employments.map((e) => e.employeeId);
    const run = await this.prisma.routeRun.findFirst({
      where: { id: routeRunId, driverId: { in: employeeIds } },
      select: { id: true, driverId: true },
    });
    if (!run) throw new NotFoundException('Recorrido no encontrado');

    return this.prisma.$transaction(
      async (tx) => {
        // Bloquea el recorrido: dos lotes simultáneos se procesan en orden.
        await tx.$queryRaw`SELECT id FROM "RouteRun" WHERE id = ${routeRunId}::uuid FOR UPDATE`;
        const current = await tx.routeRun.findUniqueOrThrow({
          where: { id: routeRunId },
          select: {
            status: true,
            startedAt: true,
            finishedAt: true,
            lastPingAt: true,
          },
        });

        const live = current.status === 'IN_PROGRESS';
        if (!live && current.status !== 'COMPLETED') {
          throw new ConflictException('El recorrido no está en curso');
        }

        const valid = this.withinWindow(pings, current);
        const inserted = await tx.locationPing.createMany({
          data: valid.map((p) => ({
            clientPingId: p.id,
            driverId: run.driverId,
            routeRunId,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracyM: p.accuracyM,
            speedMps: p.speedMps,
            heading: p.heading,
            recordedAt: p.recordedAt,
          })),
          skipDuplicates: true,
        });

        // Solo lo posterior a la última posición procesada decide visitas y "última posición".
        const fresh = valid
          .filter((p) => !current.lastPingAt || p.recordedAt > current.lastPingAt)
          .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

        const changedVisitIds: string[] = [];
        if (live && fresh.length > 0) {
          const visits = await tx.visit.findMany({
            where: { routeRunId, status: { in: ['PENDING', 'VISITED'] } },
            select: {
              id: true,
              status: true,
              method: true,
              arrivedAt: true,
              departedAt: true,
              client: {
                select: { latitude: true, longitude: true, geofenceRadiusM: true },
              },
            },
          });
          const changes = detectVisits(
            visits,
            fresh.map((p) => ({ ...p, accuracyM: p.accuracyM ?? null })),
            this.detector,
          );
          for (const [visitId, data] of changes) {
            await tx.visit.update({ where: { id: visitId }, data });
            changedVisitIds.push(visitId);
          }
        }

        const last = fresh.at(-1);
        if (last) {
          await tx.routeRun.update({
            where: { id: routeRunId },
            data: {
              lastLatitude: last.latitude,
              lastLongitude: last.longitude,
              lastAccuracyM: last.accuracyM ?? null,
              lastPingAt: last.recordedAt,
            },
          });
        }

        const visits =
          changedVisitIds.length > 0
            ? await tx.visit.findMany({
                where: { id: { in: changedVisitIds } },
                select: {
                  id: true,
                  sequence: true,
                  clientId: true,
                  status: true,
                  method: true,
                  arrivedAt: true,
                  departedAt: true,
                  distanceM: true,
                },
                orderBy: { sequence: 'asc' },
              })
            : [];

        return {
          accepted: inserted.count,
          duplicates: valid.length - inserted.count,
          rejected: pings.length - valid.length,
          visits,
        };
      },
      { timeout: 15_000 },
    );
  }

  /** Última posición de cada chofer con recorrido en curso, con su avance. */
  async live(user: AuthUser, query: LiveQuery) {
    const runs = await this.prisma.routeRun.findMany({
      where: {
        providerId: providerScope(user, query.providerId),
        status: 'IN_PROGRESS',
      },
      select: {
        id: true,
        providerId: true,
        startedAt: true,
        lastLatitude: true,
        lastLongitude: true,
        lastAccuracyM: true,
        lastPingAt: true,
        route: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { route: { name: 'asc' } },
    });

    const progress = await runProgress(
      this.prisma,
      runs.map((r) => r.id),
    );
    const now = Date.now();
    return runs.map((run) => ({
      ...run,
      signalLost:
        !run.lastPingAt || now - run.lastPingAt.getTime() > SIGNAL_LOST_MS,
      progress: progress.get(run.id),
    }));
  }

  private withinWindow(
    pings: PingDto[],
    run: { startedAt: Date | null; finishedAt: Date | null },
  ): PingDto[] {
    const latest = Date.now() + this.maxFutureSkewMs;
    const earliest = (run.startedAt?.getTime() ?? Date.now()) - START_GRACE_MS;
    const end = run.finishedAt?.getTime() ?? Infinity;
    return pings.filter((p) => {
      const t = p.recordedAt.getTime();
      return t >= earliest && t <= latest && t <= end;
    });
  }
}
