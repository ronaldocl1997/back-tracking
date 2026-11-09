import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  PasswordHasher,
  RefreshTokenError,
  TokenService,
  type TokenPair,
} from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import type { LoginDto } from './auth.schemas.js';
import { isProviderStaff } from './roles.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async login({ email, password }: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { provider: { select: { isActive: true } } },
    });

    // verify() con usuario inexistente compara contra un hash falso: la respuesta
    // tarda lo mismo y no revela qué correos existen.
    const valid = await this.hasher.verify(password, user?.passwordHash);
    const blocked =
      !user?.isActive ||
      (isProviderStaff(user.role) && !user.provider?.isActive);

    if (!user || !valid || blocked) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.hasher.hash(password) },
      });
    }

    return this.tokens.issue(user.id, {
      method: 'password',
      claims: { amr: ['pwd'] },
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      return await this.tokens.refresh(refreshToken);
    } catch (error) {
      if (error instanceof RefreshTokenError) {
        throw new UnauthorizedException('Refresh token inválido o expirado');
      }
      throw error;
    }
  }

  /** Cierra la sesión de un dispositivo. No revela si el token existía. */
  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  /** Cierra la sesión en todos los dispositivos. */
  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAll(userId);
  }

  async profile(user: AuthUser) {
    const [provider, employments] = await Promise.all([
      user.providerId
        ? this.prisma.provider.findUnique({
            where: { id: user.providerId },
            select: { id: true, name: true, timezone: true },
          })
        : null,
      this.prisma.employee.findMany({
        where: { id: { in: user.employments.map((e) => e.employeeId) } },
        select: {
          id: true,
          name: true,
          canDrive: true,
          provider: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      provider,
      employments,
    };
  }
}
