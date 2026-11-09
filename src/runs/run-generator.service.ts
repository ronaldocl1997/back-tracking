import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { dayOfWeekOf, localDate, toDbDate } from '../common/time.js';

export interface GenerationResult {
  providerId: string;
  date: string;
  created: number;
  existing: number;
  /** Asignaciones saltadas porque el chofer está inactivo. */
  skippedInactiveDriver: number;
}

/**
 * Crea los recorridos (RouteRun) de un día a partir de las asignaciones
 * semanales, con sus visitas en orden y sus acompañantes. Es idempotente:
 * correrlo varias veces (o en varias instancias) no duplica nada.
 */
@Injectable()
export class RunGeneratorService {
  private readonly logger = new Logger(RunGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** El día local de hoy de cada proveedor activo. Lo llama el job periódico. */
  async generateTodayForAllProviders(): Promise<GenerationResult[]> {
    const providers = await this.prisma.provider.findMany({
      where: { isActive: true },
      select: { id: true, timezone: true },
    });
    const results: GenerationResult[] = [];
    for (const provider of providers) {
      results.push(
        await this.generate(provider.id, localDate(provider.timezone)),
      );
    }
    return results;
  }

  async generateToday(providerId: string): Promise<GenerationResult> {
    const provider = await this.prisma.provider.findUniqueOrThrow({
      where: { id: providerId },
      select: { timezone: true },
    });
    return this.generate(providerId, localDate(provider.timezone));
  }

  /** `date` es la fecha local del proveedor, 'YYYY-MM-DD'. */
  async generate(providerId: string, date: string): Promise<GenerationResult> {
    const result: GenerationResult = {
      providerId,
      date,
      created: 0,
      existing: 0,
      skippedInactiveDriver: 0,
    };
    const dbDate = toDbDate(date);

    const schedules = await this.prisma.routeSchedule.findMany({
      where: {
        isActive: true,
        dayOfWeek: dayOfWeekOf(date),
        route: { providerId, isActive: true },
      },
      select: {
        routeId: true,
        driverId: true,
        driver: { select: { isActive: true } },
        companions: {
          where: { employee: { isActive: true } },
          select: { employeeId: true },
        },
        route: {
          select: {
            stops: {
              where: { client: { isActive: true } },
              orderBy: { sequence: 'asc' },
              select: { clientId: true, sequence: true },
            },
          },
        },
      },
    });

    const existing = await this.prisma.routeRun.findMany({
      where: { providerId, date: dbDate },
      select: { routeId: true, driverId: true },
    });
    const existingKeys = new Set(
      existing.map((r) => `${r.routeId}:${r.driverId}`),
    );

    for (const schedule of schedules) {
      if (!schedule.driver.isActive) {
        result.skippedInactiveDriver++;
        continue;
      }
      if (existingKeys.has(`${schedule.routeId}:${schedule.driverId}`)) {
        result.existing++;
        continue;
      }

      try {
        await this.prisma.routeRun.create({
          data: {
            providerId,
            routeId: schedule.routeId,
            driverId: schedule.driverId,
            date: dbDate,
            visits: {
              create: schedule.route.stops.map((stop, index) => ({
                clientId: stop.clientId,
                sequence: index + 1,
              })),
            },
            companions: {
              create: schedule.companions.map((c) => ({
                employeeId: c.employeeId,
              })),
            },
          },
        });
        result.created++;
      } catch (error) {
        // Otra instancia lo creó al mismo tiempo: está bien.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          result.existing++;
        } else {
          throw error;
        }
      }
    }

    if (result.created > 0) {
      this.logger.log(
        `Proveedor ${providerId} ${date}: ${result.created} recorridos creados`,
      );
    }
    return result;
  }

  /**
   * Cierra los recorridos de días que ya terminaron (en la zona de cada proveedor):
   * - IN_PROGRESS → COMPLETED, con las visitas pendientes como MISSED.
   * - SCHEDULED → NOT_STARTED, con todas sus visitas como MISSED.
   */
  async closePastRuns(): Promise<number> {
    const providers = await this.prisma.provider.findMany({
      select: { id: true, timezone: true },
    });
    let closed = 0;
    for (const provider of providers) {
      const today = toDbDate(localDate(provider.timezone));
      const runs = await this.prisma.routeRun.findMany({
        where: {
          providerId: provider.id,
          date: { lt: today },
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        },
        select: { id: true, status: true },
      });
      for (const run of runs) {
        await this.prisma.$transaction([
          this.prisma.visit.updateMany({
            where: { routeRunId: run.id, status: 'PENDING' },
            data: { status: 'MISSED' },
          }),
          this.prisma.routeRun.update({
            where: { id: run.id },
            data:
              run.status === 'IN_PROGRESS'
                ? { status: 'COMPLETED', finishedAt: new Date() }
                : { status: 'NOT_STARTED' },
          }),
        ]);
        closed++;
      }
    }
    if (closed > 0) this.logger.log(`${closed} recorridos de días pasados cerrados`);
    return closed;
  }
}
