import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { distanceM } from '../common/geo.js';
import { fromDbDate, localDate, toDbDate } from '../common/time.js';
import { RunGeneratorService } from './run-generator.service.js';
import { runProgress } from './run-progress.js';
import { runDetailSelect, visitSelect } from './runs.service.js';
import type {
  CheckInDto,
  MyRunsQuery,
  SkipVisitDto,
} from './runs.schemas.js';

type RunDetail = Prisma.RouteRunGetPayload<{ select: typeof runDetailSelect }>;

/**
 * La app del empleado. El chofer inicia, termina, hace check-in y salta
 * clientes; el acompañante solo consulta. Todo se limita a los recorridos en
 * los que la persona participa.
 */
@Injectable()
export class MyRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: RunGeneratorService,
  ) {}

  /**
   * Los recorridos del día (hoy por defecto, en la zona de cada proveedor).
   * Si el job aún no generó los de hoy, se generan en este momento.
   */
  async list(user: AuthUser, query: MyRunsQuery) {
    const employeeIds = this.employeeIds(user);
    if (employeeIds.length === 0) return [];

    const providerIds = [...new Set(user.employments.map((e) => e.providerId))];
    const providers = await this.prisma.provider.findMany({
      where: { id: { in: providerIds } },
      select: { id: true, timezone: true },
    });

    const runs: RunDetail[] = [];
    for (const provider of providers) {
      const today = localDate(provider.timezone);
      const date = query.date ?? today;
      if (date === today) await this.generator.generate(provider.id, today);

      runs.push(
        ...(await this.prisma.routeRun.findMany({
          where: {
            providerId: provider.id,
            date: toDbDate(date),
            ...this.participant(employeeIds),
          },
          select: runDetailSelect,
          orderBy: { route: { name: 'asc' } },
        })),
      );
    }
    return this.present(runs, employeeIds);
  }

  async findOne(user: AuthUser, id: string) {
    const employeeIds = this.employeeIds(user);
    const run = await this.prisma.routeRun.findFirst({
      where: { id, ...this.participant(employeeIds) },
      select: runDetailSelect,
    });
    if (!run) throw new NotFoundException('Recorrido no encontrado');
    const [presented] = await this.present([run], employeeIds);
    return presented;
  }

  /** Solo el chofer, el mismo día del recorrido y sin otro recorrido en curso. */
  async start(user: AuthUser, id: string) {
    const run = await this.asDriver(user, id);
    if (run.status !== 'SCHEDULED') {
      throw new ConflictException('El recorrido ya fue iniciado o terminó');
    }
    if (fromDbDate(run.date) !== localDate(run.provider.timezone)) {
      throw new ConflictException('Solo se inicia el día del recorrido');
    }

    await this.prisma.$transaction(async (tx) => {
      // Bloquea al chofer: dos "iniciar" simultáneos no dejan dos recorridos en curso.
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${run.driverId}::uuid FOR UPDATE`;
      const busy = await tx.routeRun.findFirst({
        where: { driverId: run.driverId, status: 'IN_PROGRESS' },
        select: { route: { select: { name: true } } },
      });
      if (busy) {
        throw new ConflictException(
          `Ya tienes un recorrido en curso (${busy.route.name}); termínalo primero`,
        );
      }
      const { count } = await tx.routeRun.updateMany({
        where: { id, status: 'SCHEDULED' },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
      if (count !== 1) {
        throw new ConflictException('El recorrido ya fue iniciado o terminó');
      }
    });
    return this.findOne(user, id);
  }

  /**
   * Termina el recorrido. Una visita con llegada registrada (el chofer sigue
   * en el cliente) cuenta como visitada; las demás pendientes quedan MISSED.
   */
  async finish(user: AuthUser, id: string) {
    const run = await this.asDriver(user, id);
    if (run.status !== 'IN_PROGRESS') {
      throw new ConflictException('El recorrido no está en curso');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RouteRun" WHERE id = ${id}::uuid FOR UPDATE`;
      await tx.visit.updateMany({
        where: { routeRunId: id, status: 'PENDING', arrivedAt: { not: null } },
        data: { status: 'VISITED', method: 'AUTO_GEOFENCE' },
      });
      await tx.visit.updateMany({
        where: { routeRunId: id, status: 'PENDING' },
        data: { status: 'MISSED' },
      });
      await tx.routeRun.update({
        where: { id },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
    });
    return this.findOne(user, id);
  }

  /**
   * "Llegué" manual. Dentro del radio: VISITED. Fuera: VISITED pero marcada
   * para revisión (`flagged`), porque el GPS falla bajo techo.
   */
  async checkIn(
    user: AuthUser,
    runId: string,
    visitId: string,
    dto: CheckInDto,
  ) {
    const visit = await this.pendingVisit(user, runId, visitId);
    const distance = distanceM(dto, visit.client);

    return this.prisma.visit.update({
      where: { id: visitId },
      data: {
        status: 'VISITED',
        method: 'MANUAL_CHECKIN',
        arrivedAt: visit.arrivedAt ?? new Date(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        distanceM: Math.round(distance),
        flagged: distance > visit.client.geofenceRadiusM,
        notes: dto.notes,
      },
      select: visitSelect,
    });
  }

  /** El cliente estaba cerrado, no quiso recibir, etc. */
  async skip(
    user: AuthUser,
    runId: string,
    visitId: string,
    { reason }: SkipVisitDto,
  ) {
    await this.pendingVisit(user, runId, visitId);
    return this.prisma.visit.update({
      where: { id: visitId },
      data: { status: 'SKIPPED', notes: reason },
      select: visitSelect,
    });
  }

  private async pendingVisit(user: AuthUser, runId: string, visitId: string) {
    const run = await this.asDriver(user, runId);
    if (run.status !== 'IN_PROGRESS') {
      throw new ConflictException('El recorrido no está en curso');
    }
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, routeRunId: runId },
      select: {
        status: true,
        arrivedAt: true,
        client: {
          select: { latitude: true, longitude: true, geofenceRadiusM: true },
        },
      },
    });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    if (visit.status !== 'PENDING') {
      throw new ConflictException('La visita ya fue registrada');
    }
    return visit;
  }

  /** El recorrido, solo si el usuario es su chofer (los acompañantes no operan). */
  private async asDriver(user: AuthUser, id: string) {
    const run = await this.prisma.routeRun.findFirst({
      where: { id, driverId: { in: this.employeeIds(user) } },
      select: {
        id: true,
        driverId: true,
        status: true,
        date: true,
        provider: { select: { timezone: true } },
      },
    });
    if (!run) throw new NotFoundException('Recorrido no encontrado');
    return run;
  }

  private employeeIds(user: AuthUser): string[] {
    return user.employments.map((e) => e.employeeId);
  }

  private participant(employeeIds: string[]): Prisma.RouteRunWhereInput {
    return {
      OR: [
        { driverId: { in: employeeIds } },
        { companions: { some: { employeeId: { in: employeeIds } } } },
      ],
    };
  }

  private async present(runs: RunDetail[], employeeIds: string[]) {
    const progress = await runProgress(
      this.prisma,
      runs.map((r) => r.id),
    );
    return runs.map((run) => ({
      ...run,
      date: fromDbDate(run.date),
      myRole: employeeIds.includes(run.driver.id) ? 'DRIVER' : 'COMPANION',
      companions: run.companions.map((c) => ({
        ...c.employee,
        attended: c.attended,
      })),
      progress: progress.get(run.id),
    }));
  }
}
