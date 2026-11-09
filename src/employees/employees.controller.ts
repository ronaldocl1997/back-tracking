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
  createAccountSchema,
  createEmployeeSchema,
  linkAccountSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
  type CreateAccountDto,
  type CreateEmployeeDto,
  type LinkAccountDto,
  type ListEmployeesQuery,
  type UpdateEmployeeDto,
} from './employees.schemas.js';
import { EmployeesService } from './employees.service.js';

/** Choferes y acompañantes. ADMIN ve todos; PROVIDER y SUPERVISOR solo los suyos. */
@Can(AccessPolicy, 'manage')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listEmployeesQuerySchema }) query: ListEmployeesQuery,
  ) {
    return this.employees.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.employees.findOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createEmployeeSchema }) body: CreateEmployeeDto,
  ) {
    return this.employees.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateEmployeeSchema }) body: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, body);
  }

  /** Baja lógica (isActive = false). */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.employees.deactivate(user, id);
  }

  @Post(':id/account')
  createAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: createAccountSchema }) body: CreateAccountDto,
  ) {
    return this.employees.createAccount(user, id, body);
  }

  @Can(AccessPolicy, 'admin')
  @Post(':id/account/link')
  linkAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: linkAccountSchema }) body: LinkAccountDto,
  ) {
    return this.employees.linkAccount(user, id, body);
  }

  @Delete(':id/account')
  @HttpCode(204)
  async unlinkAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.employees.unlinkAccount(user, id);
  }
}
