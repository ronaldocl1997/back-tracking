import type { Role } from '../generated/prisma/enums.js';

/** Roles que trabajan dentro de un proveedor y llevan `providerId`. */
export const PROVIDER_STAFF_ROLES = ['PROVIDER', 'SUPERVISOR'] as const;
export type ProviderStaffRole = (typeof PROVIDER_STAFF_ROLES)[number];

export function isProviderStaff(role: Role): role is ProviderStaffRole {
  return (PROVIDER_STAFF_ROLES as readonly Role[]).includes(role);
}
