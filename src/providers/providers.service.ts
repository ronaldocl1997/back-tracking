import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { providerScope } from '../auth/provider-scope.js';
import {
  paginated,
  toPrismaPage,
} from '../common/pagination/pagination.js';
import type {
  CreateProviderDto,
  ListProvidersQuery,
  UpdateProviderDto,
} from './providers.schemas.js';

const providerSelect = {
  id: true,
  name: true,
  taxId: true,
  timezone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  users: {
    where: { role: 'PROVIDER' },
    select: { id: true, name: true, email: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  },
  _count: {
    select: { users: true, employees: true, clients: true, routes: true },
  },
} satisfies Prisma.ProviderSelect;

type ProviderRow = Prisma.ProviderGetPayload<{ select: typeof providerSelect }>;

const toProvider = ({ users, ...provider }: ProviderRow) => ({ ...provider, owners: users });

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProvidersQuery) {
    const contains = (value?: string) =>
      value ? { contains: value, mode: 'insensitive' as const } : undefined;
    const where: Prisma.ProviderWhereInput = {
      isActive: query.isActive,
      name: contains(query.name),
      taxId: contains(query.taxId),
      timezone: query.timezone,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.provider.findMany({
        where,
        select: providerSelect,
        orderBy: { name: 'asc' },
        ...toPrismaPage(query),
      }),
      this.prisma.provider.count({ where }),
    ]);
    return paginated(data.map(toProvider), total, query);
  }

  /** ADMIN ve cualquiera; PROVIDER/SUPERVISOR solo el suyo (otro id responde 403). */
  async findOne(user: AuthUser, id: string) {
    providerScope(user, id);
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      select: providerSelect,
    });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');
    return toProvider(provider);
  }

  async create(data: CreateProviderDto) {
    return toProvider(await this.prisma.provider.create({ data, select: providerSelect }));
  }

  /** ADMIN edita cualquiera; el dueño (PROVIDER) solo el suyo y sin poder desactivarlo. */
  async update(user: AuthUser, id: string, data: UpdateProviderDto) {
    providerScope(user, id);
    if (user.role !== 'ADMIN' && data.isActive !== undefined) {
      throw new ForbiddenException('Solo un administrador activa o desactiva proveedores');
    }
    // Si no existe, Prisma lanza P2025 y el filtro global responde 404.
    return toProvider(
      await this.prisma.provider.update({ where: { id }, data, select: providerSelect }),
    );
  }
}
