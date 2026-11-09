import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { AccessPolicy } from '../auth/access.policy.js';
import { idParam } from '../common/schemas.js';
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
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query({ schema: listUsersQuerySchema }) query: ListUsersQuery) {
    return this.users.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', { schema: idParam }) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body({ schema: createUserSchema }) body: CreateUserDto) {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateUserSchema }) body: UpdateUserDto,
  ) {
    return this.users.update(id, body);
  }
}
