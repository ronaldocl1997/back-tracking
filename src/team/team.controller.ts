import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import { idParam } from '../common/schemas.js';
import {
  createTeamMemberSchema,
  listTeamQuerySchema,
  updateTeamMemberSchema,
  type CreateTeamMemberDto,
  type ListTeamQuery,
  type UpdateTeamMemberDto,
} from './team.schemas.js';
import { TeamService } from './team.service.js';

/** Equipo de oficina del proveedor. Solo el dueño (PROVIDER) y el ADMIN. */
@Can(AccessPolicy, 'owner')
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listTeamQuerySchema }) query: ListTeamQuery,
  ) {
    return this.team.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.team.findOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTeamMemberSchema }) body: CreateTeamMemberDto,
  ) {
    return this.team.create(user, body);
  }

  /** Desactivar (`isActive: false`) o cambiar la contraseña cierra sus sesiones. */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateTeamMemberSchema }) body: UpdateTeamMemberDto,
  ) {
    return this.team.update(user, id, body);
  }
}
