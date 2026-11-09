import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PasswordHasher } from '@nestjs/authentication';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { setupSwagger } from '../src/swagger.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { dayOfWeekOf, localDate } from '../src/common/time.js';

export const PASSWORD = 'secreta123';
export const TZ = 'America/Mexico_City';

/** Sufijo único: cada archivo de pruebas crea su propio mundo sin chocar con otros. */
export const uid = () => randomUUID().slice(0, 8);

/** Grados de latitud por metro (aprox.), para mover posiciones en metros. */
export const DEG_PER_M = 1 / 111_195;

export function today() {
  const date = localDate(TZ);
  return { date, dayOfWeek: dayOfWeekOf(date) };
}

/** La app completa, configurada como en producción, contra la base de pruebas. */
export async function createTestApp({ swagger = false } = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // scrypt con costo bajo: las pruebas crean muchas contraseñas.
    .overrideProvider(PasswordHasher)
    .useValue(new PasswordHasher({ logN: 10 }))
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  if (swagger) setupSwagger(app);
  await app.init();

  const api = apiClient(app);
  const prisma = app.get(PrismaService);
  const hasher = app.get(PasswordHasher);

  /** Crea un ADMIN directo en la base y devuelve su access token. */
  async function adminToken(): Promise<string> {
    const email = `admin-${uid()}@test.com`;
    await prisma.user.create({
      data: {
        email,
        name: 'Admin',
        role: 'ADMIN',
        passwordHash: await hasher.hash(PASSWORD),
      },
    });
    return api.login(email);
  }

  return { app, api, prisma, adminToken };
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

export function apiClient(app: NestExpressApplication) {
  const server = app.getHttpServer();
  const send = (method: Method, path: string, token?: string, body?: unknown) => {
    let req = request(server)[method](path);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };

  return {
    get: (path: string, token?: string) => send('get', path, token),
    post: (path: string, token?: string, body?: unknown) =>
      send('post', path, token, body),
    patch: (path: string, token?: string, body?: unknown) =>
      send('patch', path, token, body),
    put: (path: string, token?: string, body?: unknown) =>
      send('put', path, token, body),
    delete: (path: string, token?: string) => send('delete', path, token),

    async login(email: string, password = PASSWORD): Promise<string> {
      const res = await send('post', '/auth/login', undefined, {
        email,
        password,
      }).expect(200);
      return res.body.accessToken as string;
    },
  };
}

export type Api = ReturnType<typeof apiClient>;

/**
 * Un proveedor con su dueño ya autenticado. `role` permite crear el usuario
 * como SUPERVISOR en lugar de dueño.
 */
export async function createProvider(
  api: Api,
  admin: string,
  { role = 'PROVIDER' as 'PROVIDER' | 'SUPERVISOR' } = {},
) {
  const suffix = uid();
  const provider = (
    await api
      .post('/providers', admin, { name: `Proveedor ${suffix}`, timezone: TZ })
      .expect(201)
  ).body;
  const email = `${role.toLowerCase()}-${suffix}@test.com`;
  const user = (
    await api
      .post('/team', admin, {
        providerId: provider.id,
        email,
        password: PASSWORD,
        name: `Dueño ${suffix}`,
        role,
      })
      .expect(201)
  ).body;
  return { provider, user, email, token: await api.login(email) };
}

/** Empleado; con `account: true` también su cuenta de acceso y su token. */
export async function createEmployee(
  api: Api,
  token: string,
  data: { name: string; canDrive?: boolean },
  { account = false } = {},
) {
  const employee = (await api.post('/employees', token, data).expect(201)).body;
  if (!account) return { employee, email: undefined, token: undefined };
  const email = `emp-${uid()}@test.com`;
  await api
    .post(`/employees/${employee.id}/account`, token, { email, password: PASSWORD })
    .expect(201);
  return { employee, email, token: await api.login(email) };
}

export async function createClient(
  api: Api,
  token: string,
  name: string,
  position: { latitude: number; longitude: number },
  geofenceRadiusM = 100,
) {
  return (
    await api
      .post('/clients', token, { name, address: `Calle ${name}`, ...position, geofenceRadiusM })
      .expect(201)
  ).body;
}
