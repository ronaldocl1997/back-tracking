import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schemas.js';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import {
  booleanQuery,
  optionalText,
  searchQuery,
  sortOrder,
} from '../common/schemas.js';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido');

export const createEmployeeSchema = z.strictObject({
  /** Obligatorio para ADMIN; PROVIDER/SUPERVISOR lo omiten (se usa el suyo). */
  providerId: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  phone: phone.optional(),
  canDrive: z.boolean().default(false),
  licenseNumber: z.string().trim().min(1).max(40).optional(),
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
  providerId: z.uuid().optional(),
  isActive: booleanQuery.optional(),
  canDrive: booleanQuery.optional(),
  /** true: solo los que tienen cuenta de acceso; false: solo los que no. */
  hasAccount: booleanQuery.optional(),
  search: searchQuery.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  order: sortOrder.default('asc'),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const createAccountSchema = z.strictObject({
  email: z.email().transform((email) => email.toLowerCase()),
  password: passwordSchema,
});
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const linkAccountSchema = z.strictObject({
  userId: z.uuid(),
});
export type LinkAccountDto = z.infer<typeof linkAccountSchema>;
