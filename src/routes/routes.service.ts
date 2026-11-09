import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  providerScope,
  requireProviderScope,
} from '../auth/provider-scope.js';
import { paginated, toPrismaPage } from '../common/pagination/pagination.js';
import { assertClientsBelong } from '../common/tenant-checks.js';
import type {
  CreateRouteDto,
  ListRoutesQuery,
  SetStopsDto,
  UpdateRouteDto,
} from './routes.schemas.js';

const routeListSelect = {
  id: true,
  providerId: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { stops: true, schedules: true } },
} satisfies Prisma.RouteSelect;

const stopSelect = {
  sequence: true,
  client: {
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      geofenceRadiusM: true,
      isActive: true,
    },
  },
} satisfies Prisma.RouteStopSelect;

const routeDetailSelect = {
  id: true,
  providerId: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  stops: { select: stopSelect, orderBy: { sequence: 'asc' } },
  schedules: {
    select: {
      id: true,
      dayOfWeek: true,
      isActive: true,
      driver: { select: { id: true, name: true } },
      companions: { select: { employee: { select: { id: true, name: true } } } },
    },
    orderBy: { dayOfWeek: 'asc' },
  },
} satisfies Prisma.RouteSelect;

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListRoutesQuery) {
    const scheduleFilter: Prisma.RouteScheduleWhereInput | undefined =
      query.dayOfWeek || query.driverId
        ? { isActive: true, dayOfWeek: query.dayOfWeek, driverId: query.driverId }
        : undefined;

    const where: Prisma.RouteWhereInput = {
      providerId: providerScope(user, query.providerId),
      isActive: query.isActive,
      ...(scheduleFilter && { schedules: { some: scheduleFilter } }),
      ...(query.clientId && {
        stops: { some: { clientId: query.clientId } },
      }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        select: routeListSelect,
        orderBy: { [query.sortBy]: query.order },
        ...toPrismaPage(query),
      }),
      this.prisma.route.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /** La ruta con sus paradas en orden y sus asignaciones por día. */
  async findOne(user: AuthUser, id: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, providerId: providerScope(user) },
      select: routeDetailSelect,
    });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return route;
  }

  async create(
    user: AuthUser,
    { providerId: requested, clientIds, ...data }: CreateRouteDto,
  ) {
    const providerId = requireProviderScope(user, requested);
    await assertClientsBelong(this.prisma, providerId, clientIds);

    return this.prisma.route.create({
      data: {
        ...data,
        providerId,
        stops: {
          create: clientIds.map((clientId, index) => ({
            clientId,
            sequence: index + 1,
          })),
        },
      },
      select: routeDetailSelect,
    });
  }

  async update(user: AuthUser, id: string, data: UpdateRouteDto) {
    await this.scoped(user, id);
    return this.prisma.route.update({
      where: { id },
      data,
      select: routeDetailSelect,
    });
  }

  /** Baja lógica: se conserva para el historial de recorridos. */
  async deactivate(user: AuthUser, id: string): Promise<void> {
    await this.scoped(user, id);
    await this.prisma.route.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findStops(user: AuthUser, id: string) {
    await this.scoped(user, id);
    return this.prisma.routeStop.findMany({
      where: { routeId: id },
      select: stopSelect,
      orderBy: { sequence: 'asc' },
    });
  }

  /** Reemplaza las paradas en una transacción: el orden del arreglo es el de visita. */
  async setStops(user: AuthUser, id: string, { clientIds }: SetStopsDto) {
    const { providerId } = await this.scoped(user, id);
    await assertClientsBelong(this.prisma, providerId, clientIds);

    await this.prisma.$transaction([
      this.prisma.routeStop.deleteMany({ where: { routeId: id } }),
      this.prisma.routeStop.createMany({
        data: clientIds.map((clientId, index) => ({
          routeId: id,
          clientId,
          sequence: index + 1,
        })),
      }),
    ]);
    return this.findStops(user, id);
  }

  private async scoped(user: AuthUser, id: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, providerId: providerScope(user) },
      select: { id: true, providerId: true },
    });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return route;
  }
}
