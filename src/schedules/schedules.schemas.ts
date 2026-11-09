import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import { booleanQuery, dayOfWeek, uniqueIdList } from '../common/schemas.js';

/** Máximo de acompañantes por asignación. */
export const MAX_COMPANIONS = 10;

/** "Esta ruta, los lunes, la hace este chofer con estos acompañantes". */
export const createScheduleSchema = z.strictObject({
  driverId: z.uuid(),
  dayOfWeek,
  companionIds: uniqueIdList(MAX_COMPANIONS).default([]),
});
export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;

/** `companionIds`, si viene, reemplaza la lista completa de acompañantes. */
export const updateScheduleSchema = z.strictObject({
  driverId: z.uuid().optional(),
  dayOfWeek: dayOfWeek.optional(),
  isActive: z.boolean().optional(),
  companionIds: uniqueIdList(MAX_COMPANIONS).optional(),
});
export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;

export const listSchedulesQuerySchema = paginationQuerySchema.extend({
  providerId: z.uuid().optional(),
  routeId: z.uuid().optional(),
  dayOfWeek: dayOfWeek.optional(),
  driverId: z.uuid().optional(),
  /** Asignaciones donde ese empleado participa, como chofer o acompañante. */
  employeeId: z.uuid().optional(),
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
