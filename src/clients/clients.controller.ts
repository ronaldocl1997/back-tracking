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
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type CreateClientDto,
  type ListClientsQuery,
  type UpdateClientDto,
} from './clients.schemas.js';
import { ClientsService } from './clients.service.js';

const MANAGE: ['ADMIN', 'PROVIDER', 'SUPERVISOR'] = ['ADMIN', 'PROVIDER', 'SUPERVISOR'];

/** Clientes del proveedor. ADMIN ve todos; PROVIDER y SUPERVISOR solo los suyos. */
@Can(AccessPolicy, 'manage')
@ApiProtectedController(TAGS.clients)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiDoc('Listar clientes', {
    roles: MANAGE,
    description:
      'Filtra por ruta (`routeId`), por los que aún no están en ninguna ruta (`withoutRoute=true`), por estado, ' +
      'o busca por nombre, contacto, dirección o teléfono.',
  })
  @ApiPaginated('Client')
  @ApiError(400)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listClientsQuerySchema }) query: ListClientsQuery,
  ) {
    return this.clients.findAll(user, query);
  }

  @Get(':id')
  @ApiDoc('Ver un cliente', { roles: MANAGE, description: 'Incluye las rutas en las que está.' })
  @ApiOk('ClientDetail')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.clients.findOne(user, id);
  }

  @Post()
  @ApiDoc('Dar de alta un cliente', {
    roles: MANAGE,
    description:
      'Las coordenadas y `geofenceRadiusM` (10–2000 m, 100 por defecto) definen dónde se considera que el chofer llegó. ' +
      'El ADMIN debe indicar `providerId`.',
  })
  @ApiCreated('Client')
  @ApiError(400)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createClientSchema }) body: CreateClientDto,
  ) {
    return this.clients.create(user, body);
  }

  @Patch(':id')
  @ApiDoc('Editar cliente', {
    roles: MANAGE,
    description: 'Cambiar coordenadas o radio afecta a las visitas que aún no se registran.',
  })
  @ApiOk('Client')
  @ApiError(400)
  @ApiError(404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateClientSchema }) body: UpdateClientDto,
  ) {
    return this.clients.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiDoc('Dar de baja un cliente', {
    roles: MANAGE,
    description:
      'Baja lógica: deja de aparecer en las rutas de los choferes y en los recorridos nuevos; su historial de visitas se conserva.',
  })
  @ApiNoContent()
  @ApiError(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.clients.deactivate(user, id);
  }
}
