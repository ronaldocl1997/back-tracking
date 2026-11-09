import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import { booleanQuery } from '../common/schemas.js';

const timezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Zona horaria IANA inválida (ej. America/Mexico_City)' },
);

export const createProviderSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  taxId: z.string().trim().min(1).max(20).optional(),
  timezone: timezone.optional(),
});
export type CreateProviderDto = z.infer<typeof createProviderSchema>;

export const updateProviderSchema = createProviderSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProviderDto = z.infer<typeof updateProviderSchema>;

export const listProvidersQuerySchema = paginationQuerySchema.extend({
  isActive: booleanQuery.optional(),
  search: z.string().trim().min(1).optional(),
});
export type ListProvidersQuery = z.infer<typeof listProvidersQuerySchema>;
