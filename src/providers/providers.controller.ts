import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
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
  createProviderSchema,
  listProvidersQuerySchema,
  updateProviderSchema,
  type CreateProviderDto,
  type ListProvidersQuery,
  type UpdateProviderDto,
} from './providers.schemas.js';
import { ProvidersService } from './providers.service.js';

@ApiProtectedController(TAGS.providers)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Can(AccessPolicy, 'admin')
  @Get()
  @ApiDoc('Listar proveedores', { roles: ['ADMIN'] })
  @ApiPaginated('Provider')
  @ApiError(400)
  findAll(
    @Query({ schema: listProvidersQuerySchema }) query: ListProvidersQuery,
  ) {
    return this.providers.findAll(query);
  }

  @Can(AccessPolicy, 'manage')
  @Get(':id')
  @ApiDoc('Ver un proveedor', {
    roles: ['ADMIN', 'PROVIDER', 'SUPERVISOR'],
    description: 'Dueño y supervisor solo pueden ver el suyo (otro id responde 403).',
  })
  @ApiOk('Provider')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.providers.findOne(user, id);
  }

  @Can(AccessPolicy, 'admin')
  @Post()
  @ApiDoc('Crear proveedor', {
    roles: ['ADMIN'],
    description: 'Después crea su dueño con `POST /team` indicando `providerId` y `role: "PROVIDER"`.',
  })
  @ApiCreated('Provider')
  @ApiError(400)
  create(@Body({ schema: createProviderSchema }) body: CreateProviderDto) {
    return this.providers.create(body);
  }

  @Can(AccessPolicy, 'owner')
  @Patch(':id')
  @ApiDoc('Editar proveedor', {
    roles: ['ADMIN', 'PROVIDER'],
    description:
      'El dueño edita solo el suyo y no puede cambiar `isActive`. ' +
      'Desactivar un proveedor (ADMIN) corta el acceso de todo su equipo y sus empleados.',
  })
  @ApiOk('Provider')
  @ApiError(400)
  @ApiError(404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateProviderSchema }) body: UpdateProviderDto,
  ) {
    return this.providers.update(user, id, body);
  }
}
