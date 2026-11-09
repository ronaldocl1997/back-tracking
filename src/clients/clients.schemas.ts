import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import {
  booleanQuery,
  optionalText,
  searchQuery,
  sortOrder,
} from '../common/schemas.js';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
/** Radio del geofence en metros: suficiente para un local, sin abarcar media colonia. */
const geofenceRadiusM = z.number().int().min(10).max(2000);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido');

export const createClientSchema = z.strictObject({
  /** Obligatorio para ADMIN; PROVIDER/SUPERVISOR lo omiten (se usa el suyo). */
  providerId: z.uuid().optional(),
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(120).optional(),
  phone: phone.optional(),
  address: z.string().trim().min(1).max(300),
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
  providerId: z.uuid().optional(),
  isActive: booleanQuery.optional(),
  /** Solo los clientes que están en esta ruta. */
  routeId: z.uuid().optional(),
  /** true: solo clientes que no están en ninguna ruta (pendientes de asignar). */
  withoutRoute: booleanQuery.optional(),
  search: searchQuery.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  order: sortOrder.default('asc'),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
