import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import {
  booleanQuery,
  dayOfWeek,
  optionalText,
  searchQuery,
  sortOrder,
  uniqueIdList,
} from '../common/schemas.js';

/** Máximo de clientes por ruta. */
export const MAX_STOPS = 300;

export const createRouteSchema = z.strictObject({
  /** Obligatorio para ADMIN; PROVIDER/SUPERVISOR lo omiten (se usa el suyo). */
  providerId: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500).optional(),
  /** Clientes en el orden de visita. */
  clientIds: uniqueIdList(MAX_STOPS).default([]),
});
export type CreateRouteDto = z.infer<typeof createRouteSchema>;

export const updateRouteSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});
export type UpdateRouteDto = z.infer<typeof updateRouteSchema>;

/** Reemplaza todas las paradas: el orden del arreglo es el orden de visita. */
export const setStopsSchema = z.strictObject({
  clientIds: uniqueIdList(MAX_STOPS),
});
export type SetStopsDto = z.infer<typeof setStopsSchema>;

export const listRoutesQuerySchema = paginationQuerySchema.extend({
  providerId: z.uuid().optional(),
  isActive: booleanQuery.optional(),
  /** Rutas con alguna asignación activa ese día. */
  dayOfWeek: dayOfWeek.optional(),
  /** Rutas donde ese empleado es chofer en alguna asignación activa. */
  driverId: z.uuid().optional(),
  /** Rutas que incluyen a ese cliente. */
  clientId: z.uuid().optional(),
  search: searchQuery.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  order: sortOrder.default('asc'),
});
export type ListRoutesQuery = z.infer<typeof listRoutesQuerySchema>;
