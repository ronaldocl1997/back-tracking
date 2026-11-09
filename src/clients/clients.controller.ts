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
import { idParam } from '../common/schemas.js';
import {
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type CreateClientDto,
  type ListClientsQuery,
  type UpdateClientDto,
} from './clients.schemas.js';
import { ClientsService } from './clients.service.js';

/** Clientes del proveedor. ADMIN ve todos; PROVIDER y SUPERVISOR solo los suyos. */
@Can(AccessPolicy, 'manage')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listClientsQuerySchema }) query: ListClientsQuery,
  ) {
    return this.clients.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.clients.findOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createClientSchema }) body: CreateClientDto,
  ) {
    return this.clients.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateClientSchema }) body: UpdateClientDto,
  ) {
    return this.clients.update(user, id, body);
  }

  /** Baja lógica (isActive = false). */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.clients.deactivate(user, id);
  }
}
