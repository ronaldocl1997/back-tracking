/**
 * Formas de las respuestas, solo para la documentación (Swagger). Cada modelo
 * aparece con su nombre en "Schemas" y los endpoints lo referencian.
 * La validación de lo que ENTRA vive en los `*.schemas.ts` de cada módulo.
 */
import { z } from 'zod';
import {
  DayOfWeek,
  RouteRunStatus,
  VisitMethod,
  VisitStatus,
  Role,
} from '../../generated/prisma/enums.js';

const id = (description?: string) =>
  z.string().meta({
    format: 'uuid',
    example: '019a6f3e-8c2b-7d41-9e0a-3b5c7d9e1f20',
    ...(description && { description }),
  });
const instant = (description?: string) =>
  z.string().meta({
    format: 'date-time',
    example: '2026-11-17T14:03:22.120Z',
    ...(description && { description }),
  });
const day = z.string().meta({ format: 'date', example: '2026-11-17', description: 'Día local del proveedor' });
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

// ───────────── Comunes ─────────────

export const ErrorResponse = z.object({
  statusCode: z.number().int().meta({ example: 400 }),
  error: z.string().meta({ example: 'Bad Request' }),
  message: z
    .union([z.string(), z.array(z.string())])
    .meta({ example: 'latitude: Too big: expected number to be <=90' }),
});

export const PaginationMeta = z.object({
  page: z.number().int().meta({ example: 1 }),
  limit: z.number().int().meta({ example: 20 }),
  total: z.number().int().meta({ example: 57, description: 'Total de registros que cumplen los filtros' }),
  totalPages: z.number().int().meta({ example: 3 }),
});

const Ref = z.object({ id: id(), name: z.string() });
const PersonRef = Ref.extend({ phone: nullable(z.string()) });

// ───────────── Auth / usuarios ─────────────

export const TokenPair = z.object({
  accessToken: z.string().meta({ description: 'JWT para `Authorization: Bearer`. Vence en `expiresIn` segundos.' }),
  refreshToken: z.string().meta({ description: 'Opaco y de un solo uso: cámbialo en `POST /auth/refresh`.' }),
  expiresIn: z.number().int().meta({ example: 900, description: 'Segundos de vida del accessToken' }),
});

export const User = z.object({
  id: id(),
  email: z.string().meta({ format: 'email', example: 'ana@empresa.com' }),
  name: z.string().meta({ example: 'Ana Ruiz' }),
  role: z.enum(Role),
  isActive: z.boolean(),
  providerId: nullable(id('Solo PROVIDER y SUPERVISOR')),
  provider: nullable(
    z.object({
      id: id(),
      name: z.string().meta({ example: 'Distribuidora del Norte' }),
      taxId: nullable(z.string().meta({ example: 'DNO010101AB1' })),
      isActive: z.boolean(),
    }),
  ).meta({ description: 'Empresa del usuario (PROVIDER / SUPERVISOR); null para ADMIN y EMPLOYEE' }),
  createdAt: instant(),
  updatedAt: instant(),
});

export const Profile = z.object({
  id: id(),
  email: z.string().meta({ format: 'email' }),
  name: z.string(),
  role: z.enum(Role),
  provider: nullable(
    z.object({ id: id(), name: z.string(), timezone: z.string() }),
  ).meta({ description: 'Proveedor del usuario (PROVIDER / SUPERVISOR)' }),
  employments: z
    .array(
      z.object({
        id: id('Id del empleado'),
        name: z.string(),
        canDrive: z.boolean(),
        provider: Ref,
      }),
    )
    .meta({ description: 'EMPLOYEE: un perfil por cada proveedor para el que trabaja' }),
});

// ───────────── Catálogo ─────────────

export const Provider = z.object({
  id: id(),
  name: z.string().meta({ example: 'Distribuidora del Norte' }),
  taxId: nullable(z.string().meta({ example: 'DNO010101AB1' })),
  timezone: z.string().meta({ example: 'America/Mexico_City' }),
  isActive: z.boolean(),
  createdAt: instant(),
  updatedAt: instant(),
});

export const Employee = z.object({
  id: id(),
  providerId: id(),
  name: z.string().meta({ example: 'José Pérez' }),
  phone: nullable(z.string().meta({ example: '+52 33 1234 5678' })),
  canDrive: z.boolean().meta({ description: 'Puede asignarse como chofer' }),
  licenseNumber: nullable(z.string()),
  isActive: z.boolean(),
  createdAt: instant(),
  updatedAt: instant(),
  user: nullable(
    z.object({
      id: id(),
      email: z.string().meta({ format: 'email' }),
      isActive: z.boolean(),
    }),
  ).meta({ description: 'Cuenta para la app; null si no tiene' }),
});

const ClientFields = {
  id: id(),
  name: z.string().meta({ example: 'Abarrotes La Esperanza' }),
  address: z.string().meta({ example: 'Av. Juárez 123, Guadalajara' }),
  latitude: z.number().meta({ example: 20.6736 }),
  longitude: z.number().meta({ example: -103.344 }),
  geofenceRadiusM: z.number().int().meta({ example: 100, description: 'Radio de llegada en metros' }),
};

export const Client = z.object({
  ...ClientFields,
  providerId: id(),
  contactName: nullable(z.string()),
  phone: nullable(z.string()),
  isActive: z.boolean(),
  createdAt: instant(),
  updatedAt: instant(),
});

export const ClientDetail = Client.extend({
  routeStops: z
    .array(
      z.object({
        sequence: z.number().int(),
        route: z.object({ id: id(), name: z.string(), isActive: z.boolean() }),
      }),
    )
    .meta({ description: 'Rutas en las que está el cliente y su posición en cada una' }),
});

export const RouteStop = z.object({
  sequence: z.number().int().meta({ example: 1, description: 'Orden de visita (1, 2, 3…)' }),
  client: z.object({ ...ClientFields, isActive: z.boolean() }),
});

export const RouteSummary = z.object({
  id: id(),
  providerId: id(),
  name: z.string().meta({ example: 'Ruta Centro' }),
  description: nullable(z.string()),
  isActive: z.boolean(),
  createdAt: instant(),
  updatedAt: instant(),
  _count: z.object({
    stops: z.number().int().meta({ description: 'Clientes en la ruta' }),
    schedules: z.number().int().meta({ description: 'Asignaciones semanales' }),
  }),
});

export const RouteDetail = RouteSummary.omit({ _count: true }).extend({
  stops: z.array(RouteStop),
  schedules: z.array(
    z.object({
      id: id(),
      dayOfWeek: z.enum(DayOfWeek),
      isActive: z.boolean(),
      driver: Ref,
      companions: z.array(z.object({ employee: Ref })),
    }),
  ),
});

export const Schedule = z.object({
  id: id(),
  dayOfWeek: z.enum(DayOfWeek),
  isActive: z.boolean(),
  createdAt: instant(),
  updatedAt: instant(),
  route: z.object({ id: id(), name: z.string(), providerId: id(), isActive: z.boolean() }),
  driver: PersonRef,
  companions: z.array(z.object({ employee: PersonRef })),
});

export const MySchedule = z.object({
  id: id(),
  dayOfWeek: z.enum(DayOfWeek),
  myRole: z.enum(['DRIVER', 'COMPANION']).meta({ description: 'Qué hace el usuario en esta asignación' }),
  driver: PersonRef,
  companions: z.array(PersonRef),
  route: z.object({
    id: id(),
    name: z.string(),
    description: nullable(z.string()),
    provider: Ref,
    stops: z.array(
      z.object({
        sequence: z.number().int(),
        client: z.object({
          id: id(),
          name: z.string(),
          contactName: nullable(z.string()),
          phone: nullable(z.string()),
          address: z.string(),
          latitude: z.number(),
          longitude: z.number(),
        }),
      }),
    ),
  }),
});

// ───────────── Recorridos ─────────────

export const RunProgress = z.object({
  total: z.number().int().meta({ example: 12 }),
  visited: z.number().int().meta({ example: 8 }),
  pending: z.number().int().meta({ example: 2 }),
  missed: z.number().int().meta({ example: 1 }),
  skipped: z.number().int().meta({ example: 1 }),
  flagged: z.number().int().meta({ example: 1, description: 'Visitas marcadas para revisión del supervisor' }),
});

const RunStatus = z.enum(RouteRunStatus).meta({
  description:
    'SCHEDULED: generado, sin iniciar · IN_PROGRESS: en ruta · COMPLETED: terminado · CANCELLED: cancelado por el supervisor · NOT_STARTED: el día pasó sin iniciarse',
});

export const RunListItem = z.object({
  id: id(),
  providerId: id(),
  date: day,
  status: RunStatus,
  startedAt: nullable(instant()),
  finishedAt: nullable(instant()),
  lastPingAt: nullable(instant('Última posición recibida')),
  route: Ref,
  driver: Ref,
  progress: RunProgress,
});

export const Visit = z.object({
  id: id(),
  sequence: z.number().int().meta({ description: 'Orden planeado' }),
  status: z.enum(VisitStatus).meta({
    description: 'PENDING: por visitar · VISITED: visitado · MISSED: no se visitó · SKIPPED: saltado con motivo',
  }),
  method: nullable(z.enum(VisitMethod)).meta({
    description: 'AUTO_GEOFENCE: detectado por GPS · MANUAL_CHECKIN: el chofer marcó "llegué"',
  }),
  arrivedAt: nullable(instant('Llegada (tentativa mientras status = PENDING)')),
  departedAt: nullable(instant()),
  latitude: nullable(z.number()).meta({ description: 'Dónde estaba el chofer al registrarse la visita' }),
  longitude: nullable(z.number()),
  distanceM: nullable(z.number()).meta({ description: 'Distancia al cliente en ese momento, en metros' }),
  flagged: z.boolean().meta({ description: 'Check-in fuera del radio: pendiente de revisión' }),
  notes: nullable(z.string()),
  reviewedAt: nullable(instant()),
  reviewedBy: nullable(Ref),
  client: z.object({
    ...ClientFields,
    contactName: nullable(z.string()),
    phone: nullable(z.string()),
  }),
});

const LastPosition = {
  lastLatitude: nullable(z.number()),
  lastLongitude: nullable(z.number()),
  lastAccuracyM: nullable(z.number()),
};

export const RunDetail = RunListItem.omit({ route: true, driver: true }).extend({
  ...LastPosition,
  route: z.object({
    id: id(),
    name: z.string(),
    description: nullable(z.string()),
    provider: z.object({ id: id(), name: z.string(), timezone: z.string() }),
  }),
  driver: PersonRef,
  companions: z.array(
    PersonRef.extend({ attended: z.boolean().meta({ description: 'false: estaba planeado pero no se presentó' }) }),
  ),
  visits: z.array(Visit),
});

export const MyRun = RunDetail.extend({
  myRole: z.enum(['DRIVER', 'COMPANION']),
});

export const GenerationResult = z.object({
  providerId: id(),
  date: day,
  created: z.number().int().meta({ description: 'Recorridos nuevos' }),
  existing: z.number().int().meta({ description: 'Ya existían (no se duplican)' }),
  skippedInactiveDriver: z.number().int().meta({ description: 'Asignaciones saltadas por chofer inactivo' }),
});

const TrackPoint = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyM: nullable(z.number()),
  speedMps: nullable(z.number()),
  recordedAt: instant(),
});

export const Track = z.object({
  totalPoints: z.number().int().meta({ description: 'Posiciones guardadas en total' }),
  points: z.array(TrackPoint).meta({ description: 'En orden; reducidas a maxPoints como máximo' }),
});

export const RunMap = z.object({
  run: z.object({
    id: id(),
    date: day,
    status: RunStatus,
    startedAt: nullable(instant()),
    finishedAt: nullable(instant()),
    route: RunDetail.shape.route,
    driver: PersonRef,
    companions: RunDetail.shape.companions,
  }),
  summary: RunProgress.extend({
    followedPlannedOrder: z.boolean().meta({ description: '¿Llegó a los clientes en el orden planeado?' }),
    distanceKm: z.number().meta({ example: 42.7, description: 'Sin lecturas imprecisas ni saltos del GPS' }),
    durationMinutes: nullable(z.number()).meta({ example: 312.5 }),
    firstPositionAt: nullable(instant()),
    lastPositionAt: nullable(instant()),
  }),
  stops: z.array(
    z.object({
      visitId: id(),
      sequence: z.number().int().meta({ description: 'Orden planeado' }),
      actualOrder: nullable(z.number().int()).meta({ description: 'Orden real de llegada; null si no llegó' }),
      status: z.enum(VisitStatus),
      method: nullable(z.enum(VisitMethod)),
      arrivedAt: nullable(instant()),
      departedAt: nullable(instant()),
      minutesOnSite: nullable(z.number()).meta({ example: 6.5 }),
      checkInPosition: nullable(z.object({ latitude: z.number(), longitude: z.number() })),
      distanceM: nullable(z.number()),
      flagged: z.boolean(),
      notes: nullable(z.string()),
      reviewedBy: nullable(Ref),
      reviewedAt: nullable(instant()),
      client: Visit.shape.client,
    }),
  ),
  track: Track,
  bounds: nullable(
    z.object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() }),
  ).meta({ description: 'Recuadro que contiene trazo y clientes, para encuadrar el mapa' }),
});

// ───────────── Tracking ─────────────

export const PingBatchResult = z.object({
  accepted: z.number().int().meta({ example: 10, description: 'Posiciones nuevas guardadas' }),
  duplicates: z.number().int().meta({ example: 0, description: 'Ya recibidas antes (mismo id)' }),
  rejected: z.number().int().meta({
    example: 0,
    description: 'Fuera de la ventana del recorrido o con hora en el futuro',
  }),
  visits: z
    .array(
      z.object({
        id: id(),
        sequence: z.number().int(),
        clientId: id(),
        status: z.enum(VisitStatus),
        method: nullable(z.enum(VisitMethod)),
        arrivedAt: nullable(instant()),
        departedAt: nullable(instant()),
        distanceM: nullable(z.number()),
      }),
    )
    .meta({ description: 'Solo las visitas que cambiaron con este lote, para actualizar la pantalla' }),
});

export const LiveRun = z.object({
  id: id(),
  providerId: id(),
  startedAt: nullable(instant()),
  ...LastPosition,
  lastPingAt: nullable(instant()),
  signalLost: z.boolean().meta({ description: 'Más de 5 minutos sin recibir posiciones' }),
  route: Ref,
  driver: PersonRef,
  progress: RunProgress,
});

/** Todos los modelos; se publican en `components.schemas` con su nombre. */
export const MODELS = {
  ErrorResponse,
  PaginationMeta,
  TokenPair,
  User,
  Profile,
  Provider,
  Employee,
  Client,
  ClientDetail,
  RouteStop,
  RouteSummary,
  RouteDetail,
  Schedule,
  MySchedule,
  RunProgress,
  RunListItem,
  Visit,
  RunDetail,
  MyRun,
  GenerationResult,
  Track,
  RunMap,
  PingBatchResult,
  LiveRun,
} as const;

export type ModelName = keyof typeof MODELS;

/** Convierte los modelos a JSON Schema (OpenAPI 3.0). */
export function modelSchemas(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(MODELS).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as Record<string, unknown>,
    ]),
  );
}
