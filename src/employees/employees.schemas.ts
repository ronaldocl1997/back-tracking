import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schemas.js';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import {
  booleanQuery,
  optionalText,
  providerIdQuery,
  searchQuery,
  sortOrder,
} from '../common/schemas.js';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido');

export const createEmployeeSchema = z.strictObject({
  providerId: z.uuid().optional().meta({ description: 'Obligatorio para ADMIN; PROVIDER/SUPERVISOR lo omiten (se usa el suyo)' }),
  name: z.string().trim().min(1).max(120).meta({ example: 'José Pérez' }),
  phone: phone.optional().meta({ example: '+52 33 1234 5678' }),
  canDrive: z
    .boolean()
    .default(false)
    .meta({ description: 'true: puede asignarse como chofer. false: solo acompañante' }),
  licenseNumber: z.string().trim().min(1).max(40).optional().meta({ example: 'JAL-123456' }),
});
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

/** El proveedor de un empleado no se cambia. */
export const updateEmployeeSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  phone: phone.nullable().optional(),
  canDrive: z.boolean().optional(),
  licenseNumber: optionalText(40),
  isActive: z.boolean().optional(),
});
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  providerId: providerIdQuery(),
  isActive: booleanQuery.optional(),
  canDrive: booleanQuery.optional().meta({ description: 'true: solo choferes' }),
  hasAccount: booleanQuery
    .optional()
    .meta({ description: 'true: con cuenta para la app; false: sin cuenta' }),
  search: searchQuery.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  order: sortOrder.default('asc'),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const createAccountSchema = z.strictObject({
  email: z
    .email()
    .transform((email) => email.toLowerCase())
    .meta({ example: 'jose.perez@example.com' }),
  password: passwordSchema,
});
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const linkAccountSchema = z.strictObject({
  userId: z.uuid(),
});
export type LinkAccountDto = z.infer<typeof linkAccountSchema>;
