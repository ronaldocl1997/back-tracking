import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  providerScope,
  requireProviderScope,
} from '../auth/provider-scope.js';
import { paginated, toPrismaPage } from '../common/pagination/pagination.js';
import type {
  CreateAccountDto,
  CreateEmployeeDto,
  LinkAccountDto,
  ListEmployeesQuery,
  UpdateEmployeeDto,
} from './employees.schemas.js';

const employeeSelect = {
  id: true,
  providerId: true,
  name: true,
  phone: true,
  canDrive: true,
  licenseNumber: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  provider: { select: { id: true, name: true, isActive: true } },
  user: { select: { id: true, email: true, isActive: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
  ) {}

  async findAll(user: AuthUser, query: ListEmployeesQuery) {
    const contains = (value?: string) =>
      value ? { contains: value, mode: 'insensitive' as const } : undefined;
    const where: Prisma.EmployeeWhereInput = {
      providerId: providerScope(user, query.providerId),
      isActive: query.isActive,
      canDrive: query.canDrive,
      ...(query.hasAccount !== undefined && {
        userId: query.hasAccount ? { not: null } : null,
      }),
      name: contains(query.name),
      phone: contains(query.phone),
      licenseNumber: contains(query.licenseNumber),
      ...(query.email && { user: { email: contains(query.email) } }),
      ...(query.providerName && { provider: { name: contains(query.providerName) } }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: employeeSelect,
        orderBy: { [query.sortBy]: query.order },
        ...toPrismaPage(query),
      }),
      this.prisma.employee.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(user: AuthUser, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, providerId: providerScope(user) },
      select: employeeSelect,
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    return employee;
  }

  create(user: AuthUser, { providerId, ...data }: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: { ...data, providerId: requireProviderScope(user, providerId) },
      select: employeeSelect,
    });
  }

  async update(user: AuthUser, id: string, data: UpdateEmployeeDto) {
    await this.findOne(user, id);
    return this.prisma.employee.update({
      where: { id },
      data,
      select: employeeSelect,
    });
  }

  /** Baja lógica: se conserva para el historial de recorridos. */
  async deactivate(user: AuthUser, id: string): Promise<void> {
    await this.findOne(user, id);
    await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Crea la cuenta de acceso (rol EMPLOYEE) del empleado. */
  async createAccount(
    user: AuthUser,
    id: string,
    { email, password }: CreateAccountDto,
  ) {
    const employee = await this.findOne(user, id);
    if (employee.user) {
      throw new ConflictException('El empleado ya tiene cuenta de acceso');
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(
        'Ese correo ya tiene cuenta. Si es la misma persona, pide al administrador que la vincule',
      );
    }

    const passwordHash = await this.hasher.hash(password);
    return this.prisma.employee.update({
      where: { id },
      data: {
        user: {
          create: { email, passwordHash, name: employee.name, role: 'EMPLOYEE' },
        },
      },
      select: employeeSelect,
    });
  }

  /**
   * Solo ADMIN: vincula una cuenta EMPLOYEE existente, para alguien que ya
   * trabaja con otro proveedor. El proveedor no ve esa otra relación.
   */
  async linkAccount(user: AuthUser, id: string, { userId }: LinkAccountDto) {
    const employee = await this.findOne(user, id);
    if (employee.user) {
      throw new ConflictException('El empleado ya tiene cuenta de acceso');
    }
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!account) throw new NotFoundException('Usuario no encontrado');
    if (account.role !== 'EMPLOYEE') {
      throw new BadRequestException('Solo se vinculan cuentas con rol EMPLOYEE');
    }

    // Si ya está ligada a otro empleado del mismo proveedor, Prisma responde P2002 → 409.
    return this.prisma.employee.update({
      where: { id },
      data: { userId },
      select: employeeSelect,
    });
  }

  /** Desvincula la cuenta: la persona deja de ver los datos de este proveedor. */
  async unlinkAccount(user: AuthUser, id: string): Promise<void> {
    const employee = await this.findOne(user, id);
    if (!employee.user) {
      throw new NotFoundException('El empleado no tiene cuenta de acceso');
    }
    await this.prisma.employee.update({
      where: { id },
      data: { userId: null },
    });
  }
}
