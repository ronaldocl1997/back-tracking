/**
 * Crea (o actualiza) el primer administrador.
 * Uso: npx prisma db seed   — lee SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD de .env
 */
import 'dotenv/config';
import { PasswordHasher } from '@nestjs/authentication';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password || password.length < 8) {
  throw new Error(
    'Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 8 caracteres) en .env',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

try {
  const passwordHash = await new PasswordHasher().hash(password);
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name: 'Administrador', role: 'ADMIN' },
    update: { passwordHash, role: 'ADMIN', isActive: true },
  });
  console.log(`Administrador listo: ${admin.email}`);
} finally {
  await prisma.$disconnect();
}
