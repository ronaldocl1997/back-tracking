import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Env } from '../config/env.schema.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  providerScope,
  requireProviderScope,
} from '../auth/provider-scope.js';
import { paginated, toPrismaPage } from '../common/pagination/pagination.js';
import { assertCrew } from '../common/tenant-checks.js';
import { fromDbDate, toDbDate } from '../common/time.js';
import { RunGeneratorService } from './run-generator.service.js';
import {
  actualOrder,
  boundsOf,
  distanceKm,
  downsample,
  minutesBetween,
} from './run-map.js';
import { runProgress } from './run-progress.js';
import type {
  GenerateRunsDto,
  ListRunsQuery,
  MapQuery,
  ReviewVisitDto,
  TrackQuery,
  UpdateRunDto,
} from './runs.schemas.js';

const runListSelect = {
  id: true,
  providerId: true,
  date: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  lastPingAt: true,
  route: { select: { id: true, name: true } },
  driver: { select: { id: true, name: true } },
} satisfies Prisma.RouteRunSelect;

export const visitSelect = {
  id: true,
  sequence: true,
  status: true,
  method: true,
  arrivedAt: true,
  departedAt: true,
  latitude: true,
  longitude: true,
  distanceM: true,
  flagged: true,
  notes: true,
  reviewedAt: true,
  reviewedBy: { select: { id: true, name: true } },
  client: {
    select: {
      id: true,
      name: true,
      contactName: true,
      phone: true,
      address: true,
      latitude: true,
      longitude: true,
      geofenceRadiusM: true,
    },
  },
} satisfies Prisma.VisitSelect;

export const runDetailSelect = {
  ...runListSelect,
  lastLatitude: true,
  lastLongitude: true,
  lastAccuracyM: true,
  route: {
    select: {
      id: true,
      name: true,
      description: true,
      provider: { select: { id: true, name: true, timezone: true } },
    },
  },
  driver: { select: { id: true, name: true, phone: true } },
  companions: {
    select: {
      attended: true,
      employee: { select: { id: true, name: true, phone: true } },
    },
  },
  visits: { select: visitSelect, orderBy: { sequence: 'asc' } },
} satisfies Prisma.RouteRunSelect;

/** Vista del supervisor/dueño/admin sobre los recorridos del día. */
@Injectable()
export class RunsService {
  private readonly maxAccuracyM: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: RunGeneratorService,
    config: ConfigService<Env, true>,
  ) {
    this.maxAccuracyM = config.get('VISIT_MAX_ACCURACY_M', { infer: true });
  }

  async findAll(user: AuthUser, query: ListRunsQuery) {
    const dateFilter: Prisma.DateTimeFilter | Date | undefined = query.date
      ? toDbDate(query.date)
      : query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom && { gte: toDbDate(query.dateFrom) }),
            ...(query.dateTo && { lte: toDbDate(query.dateTo) }),
          }
        : undefined;

    const and: Prisma.RouteRunWhereInput[] = [];
    if (query.employeeId) {
      and.push({
        OR: [
          { driverId: query.employeeId },
          { companions: { some: { employeeId: query.employeeId } } },
        ],
      });
    }
    if (query.search) {
      and.push({
        OR: [
          { route: { name: { contains: query.search, mode: 'insensitive' } } },
          { driver: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.RouteRunWhereInput = {
      providerId: providerScope(user, query.providerId),
      date: dateFilter,
      routeId: query.routeId,
      driverId: query.driverId,
      status: query.status,
      ...(query.hasFlagged !== undefined && {
        visits: query.hasFlagged
          ? { some: { flagged: true } }
          : { none: { flagged: true } },
      }),
      ...(and.length > 0 && { AND: and }),
    };

    const [runs, total] = await this.prisma.$transaction([
      this.prisma.routeRun.findMany({
        where,
        select: runListSelect,
        orderBy: [{ date: 'desc' }, { route: { name: 'asc' } }],
        ...toPrismaPage(query),
      }),
      this.prisma.routeRun.count({ where }),
    ]);

    const progress = await runProgress(
      this.prisma,
      runs.map((r) => r.id),
    );
    const data = runs.map((run) => ({
      ...run,
      date: fromDbDate(run.date),
      progress: progress.get(run.id),
    }));
    return paginated(data, total, query);
  }

  async findOne(user: AuthUser, id: string) {
    const run = await this.prisma.routeRun.findFirst({
      where: { id, providerId: providerScope(user) },
      select: runDetailSelect,
    });
    if (!run) throw new NotFoundException('Recorrido no encontrado');
    const progress = await runProgress(this.prisma, [run.id]);
    return {
      ...run,
      date: fromDbDate(run.date),
      companions: run.companions.map((c) => ({
        ...c.employee,
        attended: c.attended,
      })),
      progress: progress.get(run.id),
    };
  }

  /** Genera a mano los recorridos de un día (idempotente). */
  async generate(user: AuthUser, { providerId, date }: GenerateRunsDto) {
    if (user.role === 'ADMIN' && !providerId) {
      const providers = await this.prisma.provider.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      const results = [];
      for (const provider of providers) {
        results.push(await this.generator.generate(provider.id, date));
      }
      return results;
    }
    return [
      await this.generator.generate(
        requireProviderScope(user, providerId),
        date,
      ),
    ];
  }

  /** Cambios del día: reasignar chofer (si aún no inicia) y/o acompañantes reales. */
  async update(user: AuthUser, id: string, dto: UpdateRunDto) {
    const run = await this.scoped(user, id);
    if (dto.driverId && run.status !== 'SCHEDULED') {
      throw new ConflictException(
        'Solo se cambia el chofer de un recorrido que no ha iniciado',
      );
    }
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(run.status)) {
      throw new ConflictException('El recorrido ya terminó');
    }

    const driverId = dto.driverId ?? run.driverId;
    const companionIds =
      dto.companions?.map((c) => c.employeeId) ??
      run.companions.map((c) => c.employeeId);
    await assertCrew(this.prisma, run.providerId, driverId, companionIds);

    await this.prisma.routeRun.update({
      where: { id },
      data: {
        driverId: dto.driverId,
        ...(dto.companions && {
          companions: {
            deleteMany: {},
            create: dto.companions.map((c) => ({
              employeeId: c.employeeId,
              attended: c.attended,
            })),
          },
        }),
      },
    });
    return this.findOne(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const run = await this.scoped(user, id);
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(run.status)) {
      throw new ConflictException('El recorrido ya terminó');
    }
    await this.prisma.$transaction([
      this.prisma.visit.updateMany({
        where: { routeRunId: id, status: 'PENDING' },
        data: { status: 'SKIPPED', notes: 'Recorrido cancelado' },
      }),
      this.prisma.routeRun.update({
        where: { id },
        data: { status: 'CANCELLED', finishedAt: new Date() },
      }),
    ]);
    return this.findOne(user, id);
  }

  /** El supervisor aprueba, corrige o anota una visita; queda registrado quién y cuándo. */
  async reviewVisit(
    user: AuthUser,
    runId: string,
    visitId: string,
    dto: ReviewVisitDto,
  ) {
    await this.scoped(user, runId);
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, routeRunId: runId },
      select: { id: true },
    });
    if (!visit) throw new NotFoundException('Visita no encontrada');

    return this.prisma.visit.update({
      where: { id: visitId },
      data: { ...dto, reviewedById: user.id, reviewedAt: new Date() },
      select: visitSelect,
    });
  }

  /**
   * Todo lo que el front necesita para dibujar un recorrido en una llamada:
   * el trazo real, los clientes con su resultado y tiempos, y un resumen.
   */
  async map(user: AuthUser, id: string, { maxPoints }: MapQuery) {
    const run = await this.findOne(user, id);
    const pings = await this.prisma.locationPing.findMany({
      where: { routeRunId: id },
      orderBy: { recordedAt: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        accuracyM: true,
        speedMps: true,
        recordedAt: true,
      },
    });

    const order = actualOrder(run.visits);
    const stops = run.visits.map((visit) => ({
      visitId: visit.id,
      /** Orden planeado. */
      sequence: visit.sequence,
      /** Orden real de llegada (null si no llegó). */
      actualOrder: order.get(visit.id) ?? null,
      status: visit.status,
      method: visit.method,
      arrivedAt: visit.arrivedAt,
      departedAt: visit.departedAt,
      minutesOnSite: minutesBetween(visit.arrivedAt, visit.departedAt),
      /** Dónde estaba el chofer al registrarse la visita. */
      checkInPosition:
        visit.latitude !== null && visit.longitude !== null
          ? { latitude: visit.latitude, longitude: visit.longitude }
          : null,
      distanceM: visit.distanceM,
      flagged: visit.flagged,
      notes: visit.notes,
      reviewedBy: visit.reviewedBy,
      reviewedAt: visit.reviewedAt,
      client: visit.client,
    }));

    const end = run.finishedAt ?? (run.status === 'IN_PROGRESS' ? new Date() : null);
    const points = downsample(pings, maxPoints);

    return {
      run: {
        id: run.id,
        date: run.date,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        route: run.route,
        driver: run.driver,
        companions: run.companions,
      },
      summary: {
        ...run.progress,
        followedPlannedOrder: stops
          .filter((s) => s.actualOrder !== null)
          .sort((a, b) => a.actualOrder! - b.actualOrder!)
          .every((s, i, list) => i === 0 || s.sequence > list[i - 1]!.sequence),
        distanceKm: distanceKm(pings, this.maxAccuracyM),
        durationMinutes: minutesBetween(run.startedAt, end),
        firstPositionAt: pings[0]?.recordedAt ?? null,
        lastPositionAt: pings.at(-1)?.recordedAt ?? null,
      },
      stops,
      track: { totalPoints: pings.length, points },
      bounds: boundsOf([...points, ...stops.map((s) => s.client)]),
    };
  }

  /** El trazo del recorrido, reducido a `maxPoints` puntos como máximo. */
  async track(user: AuthUser, id: string, { maxPoints }: TrackQuery) {
    await this.scoped(user, id);
    const pings = await this.prisma.locationPing.findMany({
      where: { routeRunId: id },
      orderBy: { recordedAt: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        accuracyM: true,
        speedMps: true,
        recordedAt: true,
      },
    });

    return { totalPoints: pings.length, points: downsample(pings, maxPoints) };
  }

  private async scoped(user: AuthUser, id: string) {
    const run = await this.prisma.routeRun.findFirst({
      where: { id, providerId: providerScope(user) },
      select: {
        id: true,
        providerId: true,
        driverId: true,
        status: true,
        companions: { select: { employeeId: true } },
      },
    });
    if (!run) throw new NotFoundException('Recorrido no encontrado');
    return run;
  }
}
