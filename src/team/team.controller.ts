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
  createTeamMemberSchema,
  listTeamQuerySchema,
  updateTeamMemberSchema,
  type CreateTeamMemberDto,
  type ListTeamQuery,
  type UpdateTeamMemberDto,
} from './team.schemas.js';
import { TeamService } from './team.service.js';

const OWNER: ['ADMIN', 'PROVIDER'] = ['ADMIN', 'PROVIDER'];

/** Equipo de oficina del proveedor. Solo el dueño (PROVIDER) y el ADMIN. */
@Can(AccessPolicy, 'owner')
@ApiProtectedController(TAGS.team)
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @ApiDoc('Listar el equipo', {
    roles: OWNER,
    description: 'Dueños y supervisores del proveedor. El ADMIN ve todos o filtra con `providerId`.',
  })
  @ApiPaginated('User')
  @ApiError(400)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listTeamQuerySchema }) query: ListTeamQuery,
  ) {
    return this.team.findAll(user, query);
  }

  @Get(':id')
  @ApiDoc('Ver un miembro del equipo', { roles: OWNER })
  @ApiOk('User')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.team.findOne(user, id);
  }

  @Post()
  @ApiDoc('Agregar al equipo', {
    roles: OWNER,
    description:
      'Crea un supervisor (por defecto) u otro dueño/gerente (`role: "PROVIDER"`). ' +
      'El dueño lo crea en su proveedor; el ADMIN debe indicar `providerId`.',
  })
  @ApiCreated('User')
  @ApiError(400)
  @ApiError(409, 'El correo ya está registrado')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTeamMemberSchema }) body: CreateTeamMemberDto,
  ) {
    return this.team.create(user, body);
  }

  @Patch(':id')
  @ApiDoc('Editar miembro del equipo', {
    roles: OWNER,
    description:
      'Cambia nombre, contraseña, rol o estado. Desactivar o cambiar la contraseña cierra sus sesiones. ' +
      'Nadie puede desactivarse ni quitarse el rol de dueño a sí mismo (400).',
  })
  @ApiOk('User')
  @ApiError(400)
  @ApiError(404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateTeamMemberSchema }) body: UpdateTeamMemberDto,
  ) {
    return this.team.update(user, id, body);
  }
}
