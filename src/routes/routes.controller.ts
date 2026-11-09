import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
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
  createRouteSchema,
  listRoutesQuerySchema,
  setStopsSchema,
  updateRouteSchema,
  type CreateRouteDto,
  type ListRoutesQuery,
  type SetStopsDto,
  type UpdateRouteDto,
} from './routes.schemas.js';
import { RoutesService } from './routes.service.js';

const MANAGE: ['ADMIN', 'PROVIDER', 'SUPERVISOR'] = ['ADMIN', 'PROVIDER', 'SUPERVISOR'];

/** Rutas y sus paradas. ADMIN ve todas; PROVIDER y SUPERVISOR solo las suyas. */
@Can(AccessPolicy, 'manage')
@ApiProtectedController(TAGS.routes)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  @ApiDoc('Listar rutas', {
    roles: MANAGE,
    description:
      'Filtra por día (`dayOfWeek`: rutas con alguna asignación activa ese día), por chofer (`driverId`), ' +
      'por cliente (`clientId`), por estado, o busca por nombre o descripción. Incluye cuántas paradas y asignaciones tiene cada una.',
  })
  @ApiPaginated('RouteSummary')
  @ApiError(400)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listRoutesQuerySchema }) query: ListRoutesQuery,
  ) {
    return this.routes.findAll(user, query);
  }

  @Get(':id')
  @ApiDoc('Ver una ruta', {
    roles: MANAGE,
    description: 'Con sus paradas en orden y sus asignaciones de cada día (chofer y acompañantes).',
  })
  @ApiOk('RouteDetail')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.routes.findOne(user, id);
  }

  @Post()
  @ApiDoc('Crear ruta', {
    roles: MANAGE,
    description:
      '`clientIds` en el orden de visita (opcional; se pueden agregar después con `PUT /routes/{id}/stops`). ' +
      'Los clientes deben ser del mismo proveedor y estar activos. El nombre es único por proveedor.',
  })
  @ApiCreated('RouteDetail')
  @ApiError(400)
  @ApiError(409, 'Ya existe una ruta con ese nombre en el proveedor')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createRouteSchema }) body: CreateRouteDto,
  ) {
    return this.routes.create(user, body);
  }

  @Patch(':id')
  @ApiDoc('Editar ruta', { roles: MANAGE, description: 'Nombre, descripción o estado. Las paradas se cambian con `PUT /routes/{id}/stops`.' })
  @ApiOk('RouteDetail')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'Ya existe una ruta con ese nombre en el proveedor')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateRouteSchema }) body: UpdateRouteDto,
  ) {
    return this.routes.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiDoc('Dar de baja una ruta', {
    roles: MANAGE,
    description: 'Baja lógica: deja de generar recorridos; los recorridos pasados se conservan.',
  })
  @ApiNoContent()
  @ApiError(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.routes.deactivate(user, id);
  }

  @Get(':id/stops')
  @ApiDoc('Paradas de la ruta', { roles: MANAGE, description: 'Clientes en orden de visita.' })
  @ApiOk('RouteStop', { array: true })
  @ApiError(404)
  findStops(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.routes.findStops(user, id);
  }

  @Put(':id/stops')
  @ApiDoc('Reemplazar las paradas', {
    roles: MANAGE,
    description:
      'Envía la lista completa en el orden de visita: sirve para agregar, quitar y reordenar. ' +
      'No cambia los recorridos ya generados (los de hoy conservan sus visitas).',
  })
  @ApiOk('RouteStop', { array: true })
  @ApiError(400, 'Algún cliente no existe en el proveedor, está inactivo o está repetido')
  @ApiError(404)
  setStops(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: setStopsSchema }) body: SetStopsDto,
  ) {
    return this.routes.setStops(user, id, body);
  }
}
