import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Base de datos de pruebas, separada de la de desarrollo:
 * DATABASE_URL_TEST, o la misma de DATABASE_URL con el nombre terminado en `_test`.
 * Se crea si no existe, se migra y se vacía antes de correr las pruebas.
 */
function testDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  if (!process.env.DATABASE_URL) {
    throw new Error('Define DATABASE_URL o DATABASE_URL_TEST para las pruebas e2e');
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.slice(1)}_test`;
  return url.toString();
}

export default async function setup(project: TestProject) {
  const databaseUrl = testDatabaseUrl();
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));

  // Seguro contra accidentes: nunca vaciar una base que no sea de pruebas.
  if (!database.endsWith('_test')) {
    throw new Error(
      `La base de pruebas debe terminar en _test (recibí "${database}")`,
    );
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    database,
  ]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
  }
  await admin.end();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length > 0) {
    await db.query(
      `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
  await db.end();

  project.provide('databaseUrl', databaseUrl);
}
