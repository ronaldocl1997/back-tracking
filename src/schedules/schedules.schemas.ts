import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import {
  booleanQuery,
  dayOfWeek,
  providerIdQuery,
  uniqueIdList,
  uuid,
} from '../common/schemas.js';

/** Máximo de acompañantes por asignación. */
export const MAX_COMPANIONS = 10;

/** "Esta ruta, los lunes, la hace este chofer con estos acompañantes". */
export const createScheduleSchema = z.strictObject({
  driverId: uuid('Empleado con canDrive = true'),
  dayOfWeek,
  companionIds: uniqueIdList(MAX_COMPANIONS)
    .default([])
    .meta({ description: 'Acompañantes (máx. 10)' }),
});
export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;

/** `companionIds`, si viene, reemplaza la lista completa de acompañantes. */
export const updateScheduleSchema = z.strictObject({
  driverId: z.uuid().optional(),
  dayOfWeek: dayOfWeek.optional(),
  isActive: z.boolean().optional(),
  companionIds: uniqueIdList(MAX_COMPANIONS)
    .optional()
    .meta({ description: 'Reemplaza la lista completa; [] los quita' }),
});
export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;

export const listSchedulesQuerySchema = paginationQuerySchema.extend({
  providerId: providerIdQuery(),
  routeId: z.uuid().optional(),
  dayOfWeek: dayOfWeek.optional(),
  driverId: uuid('Donde ese empleado es chofer').optional(),
  employeeId: uuid('Donde ese empleado participa, como chofer o acompañante').optional(),
  isActive: booleanQuery.optional(),
});
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;

export const listRouteSchedulesQuerySchema = z.object({
  dayOfWeek: dayOfWeek.optional(),
  isActive: booleanQuery.optional(),
});
export type ListRouteSchedulesQuery = z.infer<
  typeof listRouteSchedulesQuerySchema
>;

export const myScheduleQuerySchema = z.object({
  /** Sin día: toda la semana. */
  dayOfWeek: dayOfWeek.optional(),
});
export type MyScheduleQuery = z.infer<typeof myScheduleQuerySchema>;
