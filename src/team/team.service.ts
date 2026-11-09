import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PasswordHasher, TokenService } from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  providerScope,
  requireProviderScope,
} from '../auth/provider-scope.js';
import { PROVIDER_STAFF_ROLES } from '../auth/roles.js';
import { paginated, toPrismaPage } from '../common/pagination/pagination.js';
import type {
  CreateTeamMemberDto,
  ListTeamQuery,
  UpdateTeamMemberDto,
} from './team.schemas.js';

const memberSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  providerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/**
 * El equipo de oficina de un proveedor: dueños/gerentes (PROVIDER) y
 * supervisores (SUPERVISOR). Choferes y acompañantes se gestionan en /employees.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async findAll(user: AuthUser, query: ListTeamQuery) {
    const where: Prisma.UserWhereInput = {
      providerId: providerScope(user, query.providerId) ?? { not: null },
      role: query.role ?? { in: [...PROVIDER_STAFF_ROLES] },
      isActive: query.isActive,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: memberSelect,
        orderBy: { name: 'asc' },
        ...toPrismaPage(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(user: AuthUser, id: string) {
    const member = await this.prisma.user.findFirst({
      where: {
        id,
        providerId: providerScope(user) ?? { not: null },
        role: { in: [...PROVIDER_STAFF_ROLES] },
      },
      select: memberSelect,
    });
    if (!member) throw new NotFoundException('Miembro del equipo no encontrado');
    return member;
  }

  async create(
    user: AuthUser,
    { providerId, password, ...data }: CreateTeamMemberDto,
  ) {
    // Correo repetido → P2002 → 409.
    return this.prisma.user.create({
      data: {
        ...data,
        providerId: requireProviderScope(user, providerId),
        passwordHash: await this.hasher.hash(password),
      },
      select: memberSelect,
    });
  }

  async update(
    user: AuthUser,
    id: string,
    { password, ...data }: UpdateTeamMemberDto,
  ) {
    await this.findOne(user, id);

    // Nadie se bloquea a sí mismo: otro dueño o el ADMIN tendría que rescatarlo.
    if (id === user.id && (data.isActive === false || data.role === 'SUPERVISOR')) {
      throw new BadRequestException(
        'No puedes desactivarte ni quitarte el rol de dueño a ti mismo',
      );
    }

    const member = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(password && { passwordHash: await this.hasher.hash(password) }),
      },
      select: memberSelect,
    });

    if (password || data.isActive === false) {
      await this.tokens.revokeAll(id);
    }
    return member;
  }
}
