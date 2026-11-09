import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import {
  booleanQuery,
  dayOfWeek,
  providerIdQuery,
  uuid,
  optionalText,
  searchQuery,
  sortOrder,
  uniqueIdList,
} from '../common/schemas.js';

/** Máximo de clientes por ruta. */
export const MAX_STOPS = 300;

export const createRouteSchema = z.strictObject({
  providerId: z.uuid().optional().meta({ description: 'Obligatorio para ADMIN; PROVIDER/SUPERVISOR lo omiten (se usa el suyo)' }),
  name: z.string().trim().min(1).max(120).meta({ example: 'Ruta Centro' }),
  description: z.string().trim().min(1).max(500).optional(),
  clientIds: uniqueIdList(MAX_STOPS)
    .default([])
    .meta({ description: 'Clientes en el orden de visita (máx. 300, sin repetir)' }),
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
  clientIds: uniqueIdList(MAX_STOPS).meta({
    description: 'Lista completa de clientes en el nuevo orden de visita',
  }),
});
export type SetStopsDto = z.infer<typeof setStopsSchema>;

export const listRoutesQuerySchema = paginationQuerySchema.extend({
  providerId: providerIdQuery(),
  isActive: booleanQuery.optional(),
  dayOfWeek: dayOfWeek
    .optional()
    .meta({ description: 'Rutas con alguna asignación activa ese día' }),
  driverId: uuid('Rutas donde ese empleado es chofer').optional(),
  clientId: uuid('Rutas que incluyen a ese cliente').optional(),
  search: searchQuery.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  order: sortOrder.default('asc'),
});
export type ListRoutesQuery = z.infer<typeof listRoutesQuerySchema>;
