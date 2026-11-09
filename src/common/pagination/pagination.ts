import { z } from 'zod';

/** Parámetros de paginación comunes: `?page=1&limit=20`. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1).meta({ description: 'Página (desde 1)' }),
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({ description: 'Registros por página (máx. 100)' }),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** `skip` y `take` para Prisma. */
export function toPrismaPage({ page, limit }: PaginationQuery): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * limit, take: limit };
}

export function paginated<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationQuery,
): Paginated<T> {
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
