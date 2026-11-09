import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PasswordHasher, TokenService } from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isProviderStaff } from '../auth/roles.js';
import {
  paginated,
  toPrismaPage,
} from '../common/pagination/pagination.js';
import type {
  CreateUserDto,
  ListUsersQuery,
  UpdateUserDto,
} from './users.schemas.js';

/** Campos públicos: el hash de la contraseña nunca sale de la base de datos. */
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  providerId: true,
  provider: {
    select: {
      id: true,
      name: true,
      taxId: true,
      isActive: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async findAll(query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      providerId: query.providerId,
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
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        ...toPrismaPage(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create({ password, ...data }: CreateUserDto) {
    return this.prisma.user.create({
      data: { ...data, passwordHash: await this.hasher.hash(password) },
      select: userSelect,
    });
  }

  async update(id: string, { password, ...data }: UpdateUserDto) {
    const current = await this.findOne(id);
    if (data.providerId !== undefined && !isProviderStaff(current.role)) {
      throw new BadRequestException(
        'Solo un usuario PROVIDER o SUPERVISOR puede tener providerId',
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(password && { passwordHash: await this.hasher.hash(password) }),
      },
      select: userSelect,
    });

    // Desactivar o cambiar la contraseña cierra todas sus sesiones.
    if (password || data.isActive === false) {
      await this.tokens.revokeAll(id);
    }
    return user;
  }
}
