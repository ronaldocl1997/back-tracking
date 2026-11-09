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
  createScheduleSchema,
  listRouteSchedulesQuerySchema,
  listSchedulesQuerySchema,
  myScheduleQuerySchema,
  updateScheduleSchema,
  type CreateScheduleDto,
  type ListRouteSchedulesQuery,
  type ListSchedulesQuery,
  type MyScheduleQuery,
  type UpdateScheduleDto,
} from './schedules.schemas.js';
import { SchedulesService } from './schedules.service.js';

const MANAGE: ['ADMIN', 'PROVIDER', 'SUPERVISOR'] = ['ADMIN', 'PROVIDER', 'SUPERVISOR'];
const CREW_RULES =
  'Reglas: el chofer debe tener `canDrive = true`; chofer y acompañantes deben ser del proveedor de la ruta y estar activos; ' +
  'el chofer no puede ir también como acompañante.';

/** Asignaciones semanales: ruta + día + chofer + acompañantes. */
@Can(AccessPolicy, 'manage')
@ApiProtectedController(TAGS.schedules)
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('routes/:routeId/schedules')
  @ApiDoc('Asignaciones de una ruta', { roles: MANAGE, description: 'Ordenadas de lunes a domingo.' })
  @ApiOk('Schedule', { array: true })
  @ApiError(400)
  @ApiError(404, 'Ruta no encontrada')
  findByRoute(
    @CurrentUser() user: AuthUser,
    @Param('routeId', { schema: idParam }) routeId: string,
    @Query({ schema: listRouteSchedulesQuerySchema })
    query: ListRouteSchedulesQuery,
  ) {
    return this.schedules.findByRoute(user, routeId, query);
  }

  @Post('routes/:routeId/schedules')
  @ApiDoc('Asignar chofer a una ruta un día', {
    roles: MANAGE,
    description:
      `"Los lunes, esta ruta la hace este chofer con estos acompañantes". ${CREW_RULES} ` +
      'Una ruta puede tener varios choferes el mismo día (cada uno la recorre completa) y un chofer varias rutas el mismo día.',
  })
  @ApiCreated('Schedule')
  @ApiError(400)
  @ApiError(404, 'Ruta no encontrada')
  @ApiError(409, 'Ya existe esa asignación (misma ruta, chofer y día)')
  create(
    @CurrentUser() user: AuthUser,
    @Param('routeId', { schema: idParam }) routeId: string,
    @Body({ schema: createScheduleSchema }) body: CreateScheduleDto,
  ) {
    return this.schedules.create(user, routeId, body);
  }

  @Get('schedules')
  @ApiDoc('Listar asignaciones', {
    roles: MANAGE,
    description:
      'Por día, ruta, chofer o estado. `employeeId` encuentra las asignaciones donde esa persona va como chofer **o** como acompañante: ' +
      'sirve para ver la semana de cualquier empleado.',
  })
  @ApiPaginated('Schedule')
  @ApiError(400)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listSchedulesQuerySchema }) query: ListSchedulesQuery,
  ) {
    return this.schedules.findAll(user, query);
  }

  @Get('schedules/:id')
  @ApiDoc('Ver una asignación', { roles: MANAGE })
  @ApiOk('Schedule')
  @ApiError(404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    return this.schedules.findOne(user, id);
  }

  @Patch('schedules/:id')
  @ApiDoc('Editar asignación', {
    roles: MANAGE,
    description:
      `Cambia chofer, día, estado o acompañantes. \`companionIds\` reemplaza la lista completa (\`[]\` los quita). ${CREW_RULES} ` +
      'No afecta a los recorridos ya generados; para cambiar el de hoy usa `PATCH /runs/{id}`.',
  })
  @ApiOk('Schedule')
  @ApiError(400)
  @ApiError(404)
  @ApiError(409, 'Ya existe esa asignación (misma ruta, chofer y día)')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateScheduleSchema }) body: UpdateScheduleDto,
  ) {
    return this.schedules.update(user, id, body);
  }

  @Delete('schedules/:id')
  @HttpCode(204)
  @ApiDoc('Borrar asignación', {
    roles: MANAGE,
    description: 'Se borra del plan semanal. Los recorridos ya generados (historial) no se tocan.',
  })
  @ApiNoContent()
  @ApiError(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ) {
    await this.schedules.remove(user, id);
  }
}

/** Vista del empleado (chofer o acompañante) sobre su propia semana. */
@Can(AccessPolicy, 'employee')
@ApiProtectedController(TAGS.my)
@Controller('my')
export class MyScheduleController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('schedules')
  @ApiDoc('Mi semana', {
    roles: ['EMPLOYEE'],
    description:
      'El plan semanal del empleado en todos los proveedores para los que trabaja: como chofer ve a sus acompañantes; ' +
      'como acompañante, la ruta y el chofer con el que va. Con `dayOfWeek`, solo ese día. ' +
      'Para lo que pasa hoy (recorrido real, visitas) usa `GET /my/runs`.',
  })
  @ApiOk('MySchedule', { array: true })
  @ApiError(400)
  mySchedule(
    @CurrentUser() user: AuthUser,
    @Query({ schema: myScheduleQuerySchema }) query: MyScheduleQuery,
  ) {
    return this.schedules.mySchedule(user, query);
  }
}
