import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Comprobaciones de que los registros relacionados pertenecen al mismo
 * proveedor. Evitan, por ejemplo, meter en una ruta del proveedor A un cliente
 * del proveedor B. Responden 400 sin decir si el id existe en otro proveedor.
 */

export async function assertClientsBelong(
  prisma: PrismaService,
  providerId: string,
  clientIds: string[],
): Promise<void> {
  if (clientIds.length === 0) return;
  const found = await prisma.client.count({
    where: { id: { in: clientIds }, providerId, isActive: true },
  });
  if (found !== clientIds.length) {
    throw new BadRequestException(
      'Algún cliente no existe en este proveedor o está inactivo',
    );
  }
}

/** Chofer y acompañantes de una asignación. */
export async function assertCrew(
  prisma: PrismaService,
  providerId: string,
  driverId: string,
  companionIds: string[],
): Promise<void> {
  if (companionIds.includes(driverId)) {
    throw new BadRequestException(
      'El chofer no puede ser también acompañante en la misma asignación',
    );
  }

  const driver = await prisma.employee.findFirst({
    where: { id: driverId, providerId, isActive: true },
    select: { canDrive: true },
  });
  if (!driver) {
    throw new BadRequestException(
      'El chofer no existe en este proveedor o está inactivo',
    );
  }
  if (!driver.canDrive) {
    throw new BadRequestException(
      'Ese empleado no está habilitado para manejar (canDrive = false)',
    );
  }

  if (companionIds.length > 0) {
    const found = await prisma.employee.count({
      where: { id: { in: companionIds }, providerId, isActive: true },
    });
    if (found !== companionIds.length) {
      throw new BadRequestException(
        'Algún acompañante no existe en este proveedor o está inactivo',
      );
    }
  }
}
