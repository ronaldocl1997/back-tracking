import { z } from 'zod';
import { DayOfWeek } from '../generated/prisma/enums.js';

/** Para `@Param('id', { schema: idParam })`: rechaza con 400 lo que no sea un UUID. */
export const idParam = z.uuid();

/** Booleano en query string: `?isActive=true` / `?isActive=false`. */
export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

/** Texto de búsqueda libre: `?search=...`. */
export const searchQuery = z.string().trim().min(1).max(100);

export const sortOrder = z.enum(['asc', 'desc']);

export const dayOfWeek = z.enum(DayOfWeek);

/** Lista de UUIDs sin repetidos (ej. clientes de una ruta, acompañantes). */
export const uniqueIdList = (max: number) =>
  z
    .array(z.uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'La lista tiene elementos repetidos',
    });

/** Texto opcional que acepta `null` para borrarlo en un PATCH. */
export const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();
