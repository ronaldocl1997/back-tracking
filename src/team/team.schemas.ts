import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schemas.js';
import { PROVIDER_STAFF_ROLES } from '../auth/roles.js';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import { booleanQuery } from '../common/schemas.js';

const staffRole = z.enum(PROVIDER_STAFF_ROLES);

export const createTeamMemberSchema = z.strictObject({
  /** Obligatorio para ADMIN; el dueño lo omite (se usa su proveedor). */
  providerId: z.uuid().optional(),
  email: z.email().transform((email) => email.toLowerCase()),
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  /** SUPERVISOR por defecto; PROVIDER para otro dueño o gerente. */
  role: staffRole.default('SUPERVISOR'),
});
export type CreateTeamMemberDto = z.infer<typeof createTeamMemberSchema>;

export const updateTeamMemberSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  password: passwordSchema.optional(),
  role: staffRole.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTeamMemberDto = z.infer<typeof updateTeamMemberSchema>;

const partial = (description: string) =>
  z.string().trim().min(1).optional().meta({ description });

export const listTeamQuerySchema = paginationQuerySchema.extend({
  providerId: z.uuid().optional().meta({
    description: 'Solo el equipo de este proveedor (para el dueño siempre es el suyo)',
  }),
  providerName: partial('Nombre del proveedor; coincidencia parcial, sin distinguir mayúsculas'),
  role: staffRole.optional().meta({ description: 'PROVIDER (dueño/gerente) o SUPERVISOR' }),
  isActive: booleanQuery.optional().meta({ description: '`true` activos, `false` desactivados' }),
  name: partial('Nombre; coincidencia parcial, sin distinguir mayúsculas'),
  email: partial('Correo; coincidencia parcial, sin distinguir mayúsculas'),
});
export type ListTeamQuery = z.infer<typeof listTeamQuerySchema>;
