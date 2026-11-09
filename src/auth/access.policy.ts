import { Policy } from '@nestjs/authorization';
import type { AuthUser } from './auth-user.js';

/**
 * Reglas de acceso por rol, para usar en los controladores:
 *
 *   @Can(AccessPolicy, 'admin')      solo ADMIN
 *   @Can(AccessPolicy, 'owner')      ADMIN o PROVIDER (dueño): equipo y datos del proveedor
 *   @Can(AccessPolicy, 'manage')     ADMIN, PROVIDER o SUPERVISOR: operación diaria
 *   @Can(AccessPolicy, 'employee')   solo EMPLOYEE
 *   @Can(AccessPolicy, 'signedIn')   cualquier usuario con sesión
 *
 * Lo que PROVIDER y SUPERVISOR pueden ver dentro de su proveedor lo filtra cada
 * servicio con `providerScope()`; estas reglas solo deciden quién entra a la ruta.
 */
@Policy()
export class AccessPolicy {
  admin(user: AuthUser | null): boolean {
    return user?.role === 'ADMIN';
  }

  owner(user: AuthUser | null): boolean {
    return user?.role === 'ADMIN' || user?.role === 'PROVIDER';
  }

  manage(user: AuthUser | null): boolean {
    return (
      user?.role === 'ADMIN' ||
      user?.role === 'PROVIDER' ||
      user?.role === 'SUPERVISOR'
    );
  }

  employee(user: AuthUser | null): boolean {
    return user?.role === 'EMPLOYEE';
  }

  signedIn(user: AuthUser | null): boolean {
    return user !== null;
  }
}
