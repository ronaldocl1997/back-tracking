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
import { idParam } from '../common/schemas.js';
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

/** Rutas y sus paradas. ADMIN ve todas; PROVIDER y SUPERVISOR solo las suyas. */
@Can(AccessPolicy, 'manage')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listRoutesQuerySchema }) query: ListRoutesQuery,
  ) {
    return this.routes.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.routes.findOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createRouteSchema }) body: CreateRouteDto,
  ) {
    return this.routes.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateRouteSchema }) body: UpdateRouteDto,
  ) {
    return this.routes.update(user, id, body);
  }

  /** Baja lógica (isActive = false). */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.routes.deactivate(user, id);
  }

  @Get(':id/stops')
  findStops(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.routes.findStops(user, id);
  }

  /** Reemplaza las paradas; sirve para agregar, quitar y reordenar. */
  @Put(':id/stops')
  setStops(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: setStopsSchema }) body: SetStopsDto,
  ) {
    return this.routes.setStops(user, id, body);
  }
}
