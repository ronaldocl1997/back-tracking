import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type RefreshTokenRecord,
  type RefreshTokenStore,
} from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Guarda los refresh tokens de @nestjs/authentication en PostgreSQL.
 * Cada login abre una "familia"; cada renovación agrega un token a la misma
 * familia. Si un token ya usado se vuelve a presentar, la librería revoca la
 * familia entera (se asume robo).
 */
@Injectable()
export class PrismaRefreshTokenStore implements RefreshTokenStore {
  constructor(
    private readonly prisma: PrismaService,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!row) return undefined;
    return {
      id: row.id,
      familyId: row.familyId,
      userId: row.userId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      familyExpiresAt: row.familyExpiresAt,
      ...(row.usedAt ? { usedAt: row.usedAt } : {}),
      ...(row.claims
        ? { claims: row.claims as Record<string, unknown> }
        : {}),
    };
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.prisma.$transaction([
      // Limpieza: las familias vencidas ya no sirven (sus tokens se borran en cascada).
      this.prisma.refreshTokenFamily.deleteMany({
        where: { expiresAt: { lt: record.createdAt } },
      }),
      // Si la familia ya fue revocada, se conserva `revoked = true`.
      this.prisma.refreshTokenFamily.upsert({
        where: { id: record.familyId },
        create: {
          id: record.familyId,
          userId: record.userId,
          expiresAt: record.familyExpiresAt,
        },
        update: { userId: record.userId, expiresAt: record.familyExpiresAt },
      }),
      this.prisma.refreshToken.create({
        data: {
          id: record.id,
          familyId: record.familyId,
          userId: record.userId,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          familyExpiresAt: record.familyExpiresAt,
          usedAt: record.usedAt ?? null,
          ...(record.claims
            ? { claims: record.claims as Prisma.InputJsonObject }
            : {}),
        },
      }),
    ]);
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    // Una sola escritura condicional: de dos peticiones simultáneas, solo una gana.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: at },
    });
    return count === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prisma.refreshTokenFamily.upsert({
      where: { id: familyId },
      create: { id: familyId, revoked: true },
      update: { revoked: true },
    });
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    const family = await this.prisma.refreshTokenFamily.findUnique({
      where: { id: familyId },
      select: { revoked: true },
    });
    return family?.revoked ?? false;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshTokenFamily.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }
}
