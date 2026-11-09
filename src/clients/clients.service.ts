import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  providerScope,
  requireProviderScope,
} from '../auth/provider-scope.js';
import { paginated, toPrismaPage } from '../common/pagination/pagination.js';
import type {
  CreateClientDto,
  ListClientsQuery,
  UpdateClientDto,
} from './clients.schemas.js';

const clientSelect = {
  id: true,
  providerId: true,
  name: true,
  contactName: true,
  phone: true,
  address: true,
  latitude: true,
  longitude: true,
  geofenceRadiusM: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListClientsQuery) {
    const routeFilter: Prisma.ClientWhereInput = query.routeId
      ? { routeStops: { some: { routeId: query.routeId } } }
      : query.withoutRoute === true
        ? { routeStops: { none: {} } }
        : query.withoutRoute === false
          ? { routeStops: { some: {} } }
          : {};

    const where: Prisma.ClientWhereInput = {
      providerId: providerScope(user, query.providerId),
      isActive: query.isActive,
      ...routeFilter,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { contactName: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select: clientSelect,
        orderBy: { [query.sortBy]: query.order },
        ...toPrismaPage(query),
      }),
      this.prisma.client.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /** Incluye las rutas en las que está el cliente. */
  async findOne(user: AuthUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, providerId: providerScope(user) },
      select: {
        ...clientSelect,
        routeStops: {
          select: {
            sequence: true,
            route: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  create(user: AuthUser, { providerId, ...data }: CreateClientDto) {
    return this.prisma.client.create({
      data: { ...data, providerId: requireProviderScope(user, providerId) },
      select: clientSelect,
    });
  }

  async update(user: AuthUser, id: string, data: UpdateClientDto) {
    await this.assertExists(user, id);
    return this.prisma.client.update({
      where: { id },
      data,
      select: clientSelect,
    });
  }

  /** Baja lógica: se conserva para el historial de visitas. */
  async deactivate(user: AuthUser, id: string): Promise<void> {
    await this.assertExists(user, id);
    await this.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertExists(user: AuthUser, id: string): Promise<void> {
    const found = await this.prisma.client.count({
      where: { id, providerId: providerScope(user) },
    });
    if (!found) throw new NotFoundException('Cliente no encontrado');
  }
}
