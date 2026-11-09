import { z } from 'zod';
import { DayOfWeek } from '../generated/prisma/enums.js';

/** Para `@Param('id', { schema: idParam })`: rechaza con 400 lo que no sea un UUID. */
export const idParam = z.uuid();

/** Booleano en query string: `?isActive=true` / `?isActive=false`. */
export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

/** UUID con ejemplo, para que la documentación muestre un valor legible. */
export const uuid = (description?: string) =>
  z.uuid().meta({
    example: '019a6f3e-8c2b-7d41-9e0a-3b5c7d9e1f20',
    ...(description && { description }),
  });

/** Filtro por proveedor: solo lo usa el ADMIN; para los demás se fija el suyo. */
export const providerIdQuery = () =>
  uuid('Solo ADMIN: filtra por proveedor. Para PROVIDER/SUPERVISOR siempre es el suyo.').optional();

/** Texto de búsqueda libre: `?search=...`. */
export const searchQuery = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .meta({ description: 'Texto a buscar (sin distinguir mayúsculas)' });

export const sortOrder = z.enum(['asc', 'desc']);

export const dayOfWeek = z.enum(DayOfWeek).meta({ example: 'MONDAY' });

/** Lista de UUIDs sin repetidos (ej. clientes de una ruta, acompañantes). */
export const uniqueIdList = (max: number) =>
  z
    .array(z.uuid())
    .max(max)
    .meta({ example: ['019a6f3e-8c2b-7d41-9e0a-3b5c7d9e1f20'] })
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'La lista tiene elementos repetidos',
    });

/** Texto opcional que acepta `null` para borrarlo en un PATCH. */
export const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();
