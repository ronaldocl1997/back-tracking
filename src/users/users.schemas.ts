import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schemas.js';
import { PROVIDER_STAFF_ROLES } from '../auth/roles.js';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import { booleanQuery } from '../common/schemas.js';

const role = z.enum(['ADMIN', ...PROVIDER_STAFF_ROLES, 'EMPLOYEE']);
const email = z.email().transform((value) => value.toLowerCase());

/** PROVIDER y SUPERVISOR necesitan proveedor; ADMIN y EMPLOYEE no llevan (el empleado se liga por Employee). */
const providerMatchesRole = (data: {
  role?: string;
  providerId?: string | null;
}) =>
  (PROVIDER_STAFF_ROLES as readonly string[]).includes(data.role ?? '')
    ? !!data.providerId
    : !data.providerId;

export const createUserSchema = z
  .strictObject({
    email,
    password: passwordSchema,
    name: z.string().trim().min(1).max(120),
    role,
    providerId: z.uuid().optional(),
  })
  .refine(providerMatchesRole, {
    message: 'providerId es obligatorio para PROVIDER y SUPERVISOR, y no aplica a otros roles',
    path: ['providerId'],
  });
export type CreateUserDto = z.infer<typeof createUserSchema>;

/** El rol no se cambia: si alguien cambia de función, se crea otra cuenta. */
export const updateUserSchema = z.strictObject({
  email: email.optional(),
  password: passwordSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  providerId: z.uuid().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: role.optional().meta({ description: 'Solo cuentas de este rol' }),
  providerId: z.uuid().optional().meta({
    description: 'Solo cuentas de este proveedor (id de `GET /providers`)',
  }),
  isActive: booleanQuery.optional().meta({ description: '`true` activas, `false` desactivadas' }),
  search: z.string().trim().min(1).optional().meta({
    description: 'Busca en nombre o correo, sin distinguir mayúsculas',
  }),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
