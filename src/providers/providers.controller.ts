import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import type { AuthUser } from '../auth/auth-user.js';
import { idParam } from '../common/schemas.js';
import {
  createProviderSchema,
  listProvidersQuerySchema,
  updateProviderSchema,
  type CreateProviderDto,
  type ListProvidersQuery,
  type UpdateProviderDto,
} from './providers.schemas.js';
import { ProvidersService } from './providers.service.js';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Can(AccessPolicy, 'admin')
  @Get()
  findAll(
    @Query({ schema: listProvidersQuerySchema }) query: ListProvidersQuery,
  ) {
    return this.providers.findAll(query);
  }

  @Can(AccessPolicy, 'manage')
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.providers.findOne(user, id);
  }

  @Can(AccessPolicy, 'admin')
  @Post()
  create(@Body({ schema: createProviderSchema }) body: CreateProviderDto) {
    return this.providers.create(body);
  }

  @Can(AccessPolicy, 'owner')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateProviderSchema }) body: UpdateProviderDto,
  ) {
    return this.providers.update(user, id, body);
  }
}
