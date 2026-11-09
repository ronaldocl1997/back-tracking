import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';

/**
 * Qué proveedor puede consultar el usuario, para ponerlo en el `where` de
 * TODAS las consultas de datos de un proveedor.
 *
 * - ADMIN: el que pida (`requested`), o `undefined` = todos.
 * - PROVIDER y SUPERVISOR: siempre el suyo; pedir otro es un 403.
 * - EMPLOYEE: no consulta datos de proveedor por esta vía (tiene sus propias rutas).
 *
 * Patrón en un servicio:
 *
 *   const providerId = providerScope(user);
 *   const client = await prisma.client.findFirst({ where: { id, providerId } });
 *   if (!client) throw new NotFoundException();   // 404, no 403: no revela que existe
 */
export function providerScope(
  user: AuthUser,
  requested?: string,
): string | undefined {
  switch (user.role) {
    case 'ADMIN':
      return requested;
    case 'PROVIDER':
    case 'SUPERVISOR':
      if (!user.providerId) {
        throw new ForbiddenException('El usuario no tiene proveedor asignado');
      }
      if (requested && requested !== user.providerId) {
        throw new ForbiddenException('No tienes acceso a ese proveedor');
      }
      return user.providerId;
    default:
      throw new ForbiddenException();
  }
}

/** Igual que `providerScope`, pero exige un proveedor concreto (para crear registros). */
export function requireProviderScope(
  user: AuthUser,
  requested?: string,
): string {
  const providerId = providerScope(user, requested);
  if (!providerId) {
    throw new BadRequestException(
      'Indica providerId: un administrador debe elegir el proveedor',
    );
  }
  return providerId;
}
