# back-tracking

API para monitorear choferes en ruta: proveedores con sus choferes, clientes y rutas por día; el chofer envía su ubicación desde el celular y el backend decide qué clientes visitó.

**Stack:** NestJS 12 (ESM) · Prisma 7 · PostgreSQL · Zod · Vitest

## Roles

| Rol | Qué hace |
|---|---|
| `ADMIN` | Todo, en todos los proveedores |
| `PROVIDER` | Dueño o gerente: todo lo de su proveedor, incluido su equipo (`/team`) |
| `SUPERVISOR` | Arma rutas, clientes, asignaciones y monitorea; no gestiona el equipo ni el proveedor |
| `EMPLOYEE` | Chofer o acompañante: ve su semana y sus recorridos; el chofer envía ubicación |

Cada proveedor solo ve sus propios datos.

## Puesta en marcha

Requiere Node 22+ y PostgreSQL.

```bash
npm install                    # también genera el cliente de Prisma
cp .env.example .env           # llena DATABASE_URL, JWT_SECRET y el admin inicial
npx prisma migrate deploy      # crea las tablas
npx prisma db seed             # crea el primer ADMIN (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
npm run start:dev
```

`POST /auth/login` con el admin devuelve el `accessToken` para el resto de la API (`Authorization: Bearer <token>`).

## Scripts

| Script | |
|---|---|
| `npm run start:dev` | Servidor con recarga |
| `npm run build` / `npm run start:prod` | Compilar y correr |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript sin compilar (incluye las pruebas) |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e` | Pruebas e2e contra PostgreSQL (ver abajo) |
| `npm run prisma:migrate` | Nueva migración tras cambiar `prisma/schema.prisma` |
| `npm run prisma:studio` | Explorar la base de datos |

## Pruebas e2e

Levantan la app completa y la prueban por HTTP contra una base **separada**: `DATABASE_URL_TEST`, o la de `DATABASE_URL` con el nombre terminado en `_test` (por ejemplo `tracking_test`). Antes de correr, la base de pruebas se crea si no existe, se migra y **se vacía**; por seguridad, el setup se niega a vaciar una base cuyo nombre no termine en `_test`.

GitHub Actions corre tipos, lint, pruebas unitarias, e2e y build en cada push a `main` y en cada pull request (`.github/workflows/ci.yml`).

## Estructura

```
src/
  auth/        login JWT, refresh tokens, roles (AccessPolicy) y alcance por proveedor
  users/       cuentas (solo ADMIN)
  providers/   proveedores
  team/        equipo de oficina del proveedor (dueños y supervisores)
  employees/   choferes y acompañantes, y sus cuentas
  clients/     clientes con coordenadas y radio de llegada
  routes/      rutas y sus paradas en orden
  schedules/   asignaciones semanales (ruta + día + chofer + acompañantes) y "mi semana"
  runs/        recorridos diarios: generación, app del chofer, supervisor, mapa
  tracking/    posiciones GPS, detección de visitas, mapa en vivo, retención
  common/      paginación, validaciones, geo, fechas, filtro de errores de Prisma
prisma/        esquema, migraciones y seed
test/          pruebas e2e
```

## Configuración

Todas las variables, con sus valores por defecto, están en [`.env.example`](.env.example) y se validan al arrancar ([`src/config/env.schema.ts`](src/config/env.schema.ts)). Las de detección de visitas:

| Variable | Defecto | |
|---|---|---|
| `VISIT_DWELL_SECONDS` | 120 | Tiempo dentro del radio del cliente para confirmar la visita |
| `VISIT_MAX_ACCURACY_M` | 50 | Lecturas GPS menos precisas no deciden visitas |
| `PING_RETENTION_DAYS` | 0 | Días que se guarda el trazo GPS (0 = siempre); visitas y recorridos no se borran |
