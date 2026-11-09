import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import { isProviderStaff } from './roles.js';

/**
 * Lee `Authorization: Bearer <jwt>`, verifica firma, expiración, issuer y
 * audience (con las opciones `accessToken` del módulo) y carga el usuario.
 * Devolver `null` rechaza el token con 401.
 */
@Injectable()
export class JwtAuthProvider extends JwtBearerProvider<AuthUser> {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuthenticationRegistry,
  ) {
    super({ realm: 'back-tracking' });
    registry.registerProvider(this);
  }

  protected async validate({ sub }: JwtClaims): Promise<AuthUser | null> {
    if (!sub) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      include: {
        provider: { select: { isActive: true } },
        employeeProfiles: {
          where: { isActive: true, provider: { isActive: true } },
          select: { id: true, providerId: true },
        },
      },
    });

    if (!user?.isActive) return null;
    if (isProviderStaff(user.role) && !user.provider?.isActive) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      providerId: user.providerId,
      employments: user.employeeProfiles.map((profile) => ({
        employeeId: profile.id,
        providerId: profile.providerId,
      })),
    };
  }
}
