import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination.js';
import { booleanQuery, searchQuery } from '../common/schemas.js';
import { RouteRunStatus } from '../generated/prisma/enums.js';

/** Fecha 'YYYY-MM-DD' válida. */
export const dateString = z.iso.date();

export const runStatus = z.enum(RouteRunStatus);

export const listRunsQuerySchema = paginationQuerySchema.extend({
  providerId: z.uuid().optional(),
  /** Un día concreto, o un rango con dateFrom/dateTo. */
  date: dateString.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  routeId: z.uuid().optional(),
  /** Recorridos donde ese empleado manejó. */
  driverId: z.uuid().optional(),
  /** Recorridos donde ese empleado participó, como chofer o acompañante. */
  employeeId: z.uuid().optional(),
  /** Busca por nombre de la ruta o del chofer: `?search=jose`. */
  search: searchQuery.optional(),
  status: runStatus.optional(),
  /** Solo recorridos con alguna visita marcada para revisión. */
  hasFlagged: booleanQuery.optional(),
})
  .refine((q) => !(q.date && (q.dateFrom || q.dateTo)), {
    message: 'Usa date o el rango dateFrom/dateTo, no ambos',
  })
  .refine((q) => !(q.dateFrom && q.dateTo && q.dateFrom > q.dateTo), {
    message: 'dateFrom debe ser anterior o igual a dateTo',
  });
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;

export const generateRunsSchema = z.strictObject({
  /** ADMIN sin providerId: todos los proveedores activos. */
  providerId: z.uuid().optional(),
  date: dateString,
});
export type GenerateRunsDto = z.infer<typeof generateRunsSchema>;

/** Cambios del día: otro chofer (si aún no inicia) y/o acompañantes reales. */
export const updateRunSchema = z
  .strictObject({
    driverId: z.uuid().optional(),
    companions: z
      .array(
        z.strictObject({
          employeeId: z.uuid(),
          /** false: estaba planeado pero no se presentó. */
          attended: z.boolean().default(true),
        }),
      )
      .max(10)
      .refine(
        (list) => new Set(list.map((c) => c.employeeId)).size === list.length,
        { message: 'Acompañantes repetidos' },
      )
      .optional(),
  })
  .refine((dto) => dto.driverId !== undefined || dto.companions !== undefined, {
    message: 'Indica driverId o companions',
  });
export type UpdateRunDto = z.infer<typeof updateRunSchema>;

/** Corrección del supervisor sobre una visita. */
export const reviewVisitSchema = z
  .strictObject({
    status: z.enum(['VISITED', 'MISSED', 'SKIPPED']).optional(),
    /** false = revisada y aprobada. */
    flagged: z.boolean().optional(),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'Indica al menos un cambio',
  });
export type ReviewVisitDto = z.infer<typeof reviewVisitSchema>;

export const mapQuerySchema = z.object({
  /** Máximo de puntos del trazo; si hay más, se reduce uniformemente. */
  maxPoints: z.coerce.number().int().min(10).max(5000).default(1000),
});
export type MapQuery = z.infer<typeof mapQuerySchema>;

export const trackQuerySchema = z.object({
  /** Máximo de puntos a devolver; si hay más, se reduce uniformemente. */
  maxPoints: z.coerce.number().int().min(10).max(5000).default(1000),
});
export type TrackQuery = z.infer<typeof trackQuerySchema>;

// ───────────── App del chofer ─────────────

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const checkInSchema = z.strictObject({
  latitude,
  longitude,
  accuracyM: z.number().min(0).max(10_000).optional(),
  notes: z.string().trim().min(1).max(500).optional(),
});
export type CheckInDto = z.infer<typeof checkInSchema>;

export const skipVisitSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
});
export type SkipVisitDto = z.infer<typeof skipVisitSchema>;

export const myRunsQuerySchema = z.object({
  /** Por defecto, hoy. */
  date: dateString.optional(),
});
export type MyRunsQuery = z.infer<typeof myRunsQuerySchema>;
