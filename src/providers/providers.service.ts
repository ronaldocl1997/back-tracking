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

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProvidersQuery) {
    const where: Prisma.ProviderWhereInput = {
      isActive: query.isActive,
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.provider.findMany({
        where,
        orderBy: { name: 'asc' },
        ...toPrismaPage(query),
      }),
      this.prisma.provider.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /** ADMIN ve cualquiera; PROVIDER/SUPERVISOR solo el suyo (otro id responde 403). */
  async findOne(user: AuthUser, id: string) {
    providerScope(user, id);
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');
    return provider;
  }

  create(data: CreateProviderDto) {
    return this.prisma.provider.create({ data });
  }

  /** ADMIN edita cualquiera; el dueño (PROVIDER) solo el suyo y sin poder desactivarlo. */
  update(user: AuthUser, id: string, data: UpdateProviderDto) {
    providerScope(user, id);
    if (user.role !== 'ADMIN' && data.isActive !== undefined) {
      throw new ForbiddenException('Solo un administrador activa o desactiva proveedores');
    }
    // Si no existe, Prisma lanza P2025 y el filtro global responde 404.
    return this.prisma.provider.update({ where: { id }, data });
  }
}
