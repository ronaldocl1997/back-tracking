import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import {
  booleanQuery,
  optionalText,
  providerIdQuery,
  uuid,
  searchQuery,
  sortOrder,
} from '../common/schemas.js';

const latitude = z.number().min(-90).max(90).meta({ example: 20.6736 });
const longitude = z.number().min(-180).max(180).meta({ example: -103.344 });
/** Radio del geofence en metros: suficiente para un local, sin abarcar media colonia. */
const geofenceRadiusM = z.number().int().min(10).max(2000).meta({
  description: 'Radio en metros dentro del cual se considera que el chofer llegó (100 por defecto)',
  example: 100,
});
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido');

export const createClientSchema = z.strictObject({
  providerId: z.uuid().optional().meta({ description: 'Obligatorio para ADMIN; PROVIDER/SUPERVISOR lo omiten (se usa el suyo)' }),
  name: z.string().trim().min(1).max(160).meta({ example: 'Abarrotes La Esperanza' }),
  contactName: z.string().trim().min(1).max(120).optional().meta({ example: 'Ramiro López' }),
  phone: phone.optional().meta({ example: '+52 33 1234 5678' }),
  address: z.string().trim().min(1).max(300).meta({ example: 'Av. Juárez 123, Guadalajara' }),
  latitude,
  longitude,
  geofenceRadiusM: geofenceRadiusM.optional(),
});
export type CreateClientDto = z.infer<typeof createClientSchema>;

/** El proveedor de un cliente no se cambia. */
export const updateClientSchema = z.strictObject({
  name: z.string().trim().min(1).max(160).optional(),
  contactName: optionalText(120),
  phone: phone.nullable().optional(),
  address: z.string().trim().min(1).max(300).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  geofenceRadiusM: geofenceRadiusM.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateClientDto = z.infer<typeof updateClientSchema>;

export const listClientsQuerySchema = paginationQuerySchema.extend({
  providerId: providerIdQuery(),
  isActive: booleanQuery.optional(),
  routeId: uuid('Solo los clientes de esta ruta').optional(),
  withoutRoute: booleanQuery
    .optional()
    .meta({ description: 'true: solo clientes que no están en ninguna ruta' }),
  search: searchQuery.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  order: sortOrder.default('asc'),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
