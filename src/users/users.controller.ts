import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import {
  ApiCreated,
  ApiDoc,
  ApiError,
  ApiOk,
  ApiPaginated,
  ApiProtectedController,
} from '../common/openapi/decorators.js';
import { idParam } from '../common/schemas.js';
import { TAGS } from '../swagger.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type CreateUserDto,
  type ListUsersQuery,
  type UpdateUserDto,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

/** Administración de cuentas: solo ADMIN. */
@Can(AccessPolicy, 'admin')
@ApiProtectedController(TAGS.users)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiDoc('Listar usuarios', {
    roles: ['ADMIN'],
    description:
      'Todas las cuentas. Filtra por rol, proveedor (`providerId`), estado o busca por nombre/correo. ' +
      'Cada cuenta trae `provider` con los datos de su empresa (null si no tiene).',
  })
  @ApiPaginated('User')
  @ApiError(400)
  findAll(@Query({ schema: listUsersQuerySchema }) query: ListUsersQuery) {
    return this.users.findAll(query);
  }

  @Get(':id')
  @ApiDoc('Ver un usuario', { roles: ['ADMIN'] })
  @ApiOk('User')
  @ApiError(404)
  findOne(@Param('id', { schema: idParam }) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @ApiDoc('Crear usuario', {
    roles: ['ADMIN'],
    description:
      '`providerId` es obligatorio para `PROVIDER` y `SUPERVISOR` y no aplica a otros roles. ' +
      'Las cuentas de choferes se crean mejor desde `POST /employees/{id}/account`, que además las liga al empleado.',
  })
  @ApiCreated('User')
  @ApiError(400)
  @ApiError(409, 'El correo ya está registrado')
  create(@Body({ schema: createUserSchema }) body: CreateUserDto) {
    return this.users.create(body);
  }

  @Patch(':id')
  @ApiDoc('Editar usuario', {
    roles: ['ADMIN'],
    description: 'El rol no se cambia. Desactivar (`isActive: false`) o cambiar la contraseña cierra todas sus sesiones.',
  })
  @ApiOk('User')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'El correo ya está registrado')
  update(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateUserSchema }) body: UpdateUserDto,
  ) {
    return this.users.update(id, body);
  }
}
