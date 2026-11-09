import type { Role } from '../generated/prisma/enums.js';

/** Un perfil de empleado del usuario dentro de un proveedor. */
export interface Employment {
  employeeId: string;
  providerId: string;
}

/**
 * El usuario autenticado, tal como lo ven los controladores (`@CurrentUser()`)
 * y las políticas. Se arma en cada petición desde la base de datos, así que un
 * usuario desactivado pierde el acceso aunque su token no haya expirado.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Solo para role = PROVIDER o SUPERVISOR. */
  providerId: string | null;
  /** Solo para role = EMPLOYEE: un perfil por proveedor para el que trabaja. */
  employments: Employment[];
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthUser;
  }
}
