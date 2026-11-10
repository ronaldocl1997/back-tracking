import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  ApiCreated,
  ApiDoc,
  ApiError,
  ApiNoContent,
  ApiOk,
  ApiPaginated,
  ApiProtectedController,
} from '../common/openapi/decorators.js';
import { idParam } from '../common/schemas.js';
import { TAGS } from '../swagger.js';
import {
  createAccountSchema,
  createEmployeeSchema,
  linkAccountSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
  type CreateAccountDto,
  type CreateEmployeeDto,
  type LinkAccountDto,
  type ListEmployeesQuery,
  type UpdateEmployeeDto,
} from './employees.schemas.js';
import { EmployeesService } from './employees.service.js';

const MANAGE: ['ADMIN', 'PROVIDER', 'SUPERVISOR'] = ['ADMIN', 'PROVIDER', 'SUPERVISOR'];

/** Choferes y acompañantes. ADMIN ve todos; PROVIDER y SUPERVISOR solo los suyos. */
@Can(AccessPolicy, 'manage')
@ApiProtectedController(TAGS.employees)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ApiDoc('Listar empleados', {
    roles: MANAGE,
    description:
      'Los filtros se combinan: `canDrive` (choferes), `hasAccount` (con cuenta para la app), estado, ' +
      'nombre, teléfono, licencia, correo de la cuenta y proveedor (`providerId` exacto o `providerName` parcial, solo ADMIN). ' +
      'Cada empleado trae `provider` y su cuenta (`user`).',
  })
  @ApiPaginated('Employee')
  @ApiError(400)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listEmployeesQuerySchema }) query: ListEmployeesQuery,
  ) {
    return this.employees.findAll(user, query);
  }

  @Get(':id')
  @ApiDoc('Ver un empleado', { roles: MANAGE })
  @ApiOk('Employee')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.employees.findOne(user, id);
  }

  @Post()
  @ApiDoc('Dar de alta un empleado', {
    roles: MANAGE,
    description:
      'Chofer (`canDrive: true`) o acompañante. Queda en el proveedor del usuario; el ADMIN debe indicar `providerId`. ' +
      'Para que use la app, créale cuenta con `POST /employees/{id}/account`.',
  })
  @ApiCreated('Employee')
  @ApiError(400)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createEmployeeSchema }) body: CreateEmployeeDto,
  ) {
    return this.employees.create(user, body);
  }

  @Patch(':id')
  @ApiDoc('Editar empleado', { roles: MANAGE, description: 'El proveedor de un empleado no se cambia.' })
  @ApiOk('Employee')
  @ApiError(400)
  @ApiError(404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateEmployeeSchema }) body: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiDoc('Dar de baja un empleado', {
    roles: MANAGE,
    description:
      'Baja lógica (`isActive = false`): se conserva para el historial. ' +
      'Deja de generarse en recorridos nuevos; sus asignaciones semanales no se borran.',
  })
  @ApiNoContent()
  @ApiError(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.employees.deactivate(user, id);
  }

  @Post(':id/account')
  @ApiDoc('Crear cuenta para la app', {
    roles: MANAGE,
    description:
      'Crea un usuario `EMPLOYEE` con ese correo y contraseña y lo liga al empleado. ' +
      'Si el correo ya existe responde 409: si es la misma persona trabajando para otro proveedor, el ADMIN la vincula con `/account/link`.',
  })
  @ApiCreated('Employee')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'El empleado ya tiene cuenta o el correo ya está registrado')
  createAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: createAccountSchema }) body: CreateAccountDto,
  ) {
    return this.employees.createAccount(user, id, body);
  }

  @Can(AccessPolicy, 'admin')
  @Post(':id/account/link')
  @ApiDoc('Vincular una cuenta existente', {
    roles: ['ADMIN'],
    description:
      'Para un chofer que ya tiene cuenta con otro proveedor: con la misma cuenta verá los recorridos de ambos. ' +
      'Solo cuentas con rol `EMPLOYEE`. Ningún proveedor se entera del otro.',
  })
  @ApiCreated('Employee')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'El empleado ya tiene cuenta, o esa cuenta ya está ligada a otro empleado del mismo proveedor')
  linkAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: linkAccountSchema }) body: LinkAccountDto,
  ) {
    return this.employees.linkAccount(user, id, body);
  }

  @Delete(':id/account')
  @HttpCode(204)
  @ApiDoc('Desvincular la cuenta', {
    roles: MANAGE,
    description: 'La persona deja de ver los datos de este proveedor. La cuenta no se borra.',
  })
  @ApiNoContent()
  @ApiError(404, 'El empleado no existe o no tiene cuenta')
  async unlinkAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.employees.unlinkAccount(user, id);
  }
}
