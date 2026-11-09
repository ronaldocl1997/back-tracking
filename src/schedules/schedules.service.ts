import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { providerScope } from '../auth/provider-scope.js';
import { paginated, toPrismaPage } from '../common/pagination/pagination.js';
import { assertCrew } from '../common/tenant-checks.js';
import type {
  CreateScheduleDto,
  ListRouteSchedulesQuery,
  ListSchedulesQuery,
  MyScheduleQuery,
  UpdateScheduleDto,
} from './schedules.schemas.js';

const scheduleSelect = {
  id: true,
  dayOfWeek: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  route: { select: { id: true, name: true, providerId: true, isActive: true } },
  driver: { select: { id: true, name: true, phone: true } },
  companions: {
    select: { employee: { select: { id: true, name: true, phone: true } } },
  },
} satisfies Prisma.RouteScheduleSelect;

/** Lo que ve un empleado de su día: la ruta completa con sus clientes. */
const myScheduleSelect = {
  id: true,
  dayOfWeek: true,
  driverId: true,
  driver: { select: { id: true, name: true, phone: true } },
  companions: {
    select: { employee: { select: { id: true, name: true, phone: true } } },
  },
  route: {
    select: {
      id: true,
      name: true,
      description: true,
      provider: { select: { id: true, name: true } },
      stops: {
        orderBy: { sequence: 'asc' },
        where: { client: { isActive: true } },
        select: {
          sequence: true,
          client: {
            select: {
              id: true,
              name: true,
              contactName: true,
              phone: true,
              address: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RouteScheduleSelect;

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListSchedulesQuery) {
    const where: Prisma.RouteScheduleWhereInput = {
      route: { providerId: providerScope(user, query.providerId) },
      routeId: query.routeId,
      dayOfWeek: query.dayOfWeek,
      driverId: query.driverId,
      isActive: query.isActive,
      ...(query.employeeId && {
        OR: [
          { driverId: query.employeeId },
          { companions: { some: { employeeId: query.employeeId } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.routeSchedule.findMany({
        where,
        select: scheduleSelect,
        orderBy: [{ dayOfWeek: 'asc' }, { route: { name: 'asc' } }],
        ...toPrismaPage(query),
      }),
      this.prisma.routeSchedule.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findByRoute(
    user: AuthUser,
    routeId: string,
    query: ListRouteSchedulesQuery,
  ) {
    await this.scopedRoute(user, routeId);
    return this.prisma.routeSchedule.findMany({
      where: { routeId, dayOfWeek: query.dayOfWeek, isActive: query.isActive },
      select: scheduleSelect,
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const schedule = await this.prisma.routeSchedule.findFirst({
      where: { id, route: { providerId: providerScope(user) } },
      select: scheduleSelect,
    });
    if (!schedule) throw new NotFoundException('Asignación no encontrada');
    return schedule;
  }

  async create(
    user: AuthUser,
    routeId: string,
    { driverId, dayOfWeek, companionIds }: CreateScheduleDto,
  ) {
    const route = await this.scopedRoute(user, routeId);
    await assertCrew(this.prisma, route.providerId, driverId, companionIds);

    // Misma ruta + chofer + día repetido → P2002 → 409.
    return this.prisma.routeSchedule.create({
      data: {
        routeId,
        driverId,
        dayOfWeek,
        companions: {
          create: companionIds.map((employeeId) => ({ employeeId })),
        },
      },
      select: scheduleSelect,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateScheduleDto) {
    const current = await this.findOne(user, id);
    const driverId = dto.driverId ?? current.driver.id;
    const companionIds =
      dto.companionIds ?? current.companions.map((c) => c.employee.id);

    if (dto.driverId !== undefined || dto.companionIds !== undefined) {
      await assertCrew(
        this.prisma,
        current.route.providerId,
        driverId,
        companionIds,
      );
    }

    return this.prisma.routeSchedule.update({
      where: { id },
      data: {
        driverId: dto.driverId,
        dayOfWeek: dto.dayOfWeek,
        isActive: dto.isActive,
        ...(dto.companionIds && {
          companions: {
            deleteMany: {},
            create: dto.companionIds.map((employeeId) => ({ employeeId })),
          },
        }),
      },
      select: scheduleSelect,
    });
  }

  /** Borra la asignación del plan. El historial vive en los recorridos, no aquí. */
  async remove(user: AuthUser, id: string): Promise<void> {
    await this.findOne(user, id);
    await this.prisma.routeSchedule.delete({ where: { id } });
  }

  /**
   * La semana (o un día) del empleado autenticado, en todos los proveedores
   * para los que trabaja: como chofer ve a sus acompañantes; como acompañante,
   * la ruta y el chofer con el que va.
   */
  async mySchedule(user: AuthUser, query: MyScheduleQuery) {
    const employeeIds = user.employments.map((e) => e.employeeId);
    if (employeeIds.length === 0) return [];

    const schedules = await this.prisma.routeSchedule.findMany({
      where: {
        isActive: true,
        dayOfWeek: query.dayOfWeek,
        route: { isActive: true, provider: { isActive: true } },
        OR: [
          { driverId: { in: employeeIds } },
          { companions: { some: { employeeId: { in: employeeIds } } } },
        ],
      },
      select: myScheduleSelect,
      orderBy: [{ dayOfWeek: 'asc' }, { route: { name: 'asc' } }],
    });

    return schedules.map(({ driverId, companions, ...schedule }) => ({
      ...schedule,
      myRole: employeeIds.includes(driverId) ? 'DRIVER' : 'COMPANION',
      companions: companions.map((c) => c.employee),
    }));
  }

  private async scopedRoute(user: AuthUser, routeId: string) {
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, providerId: providerScope(user) },
      select: { id: true, providerId: true },
    });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return route;
  }
}
