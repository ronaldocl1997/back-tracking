import { z } from 'zod';

export const MAX_PINGS_PER_BATCH = 500;

const pingSchema = z.strictObject({
  /** UUID generado por el celular: si el lote se reenvía, no se duplica. */
  id: z.uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(10_000).optional(),
  speedMps: z.number().min(0).max(100).optional(),
  heading: z.number().min(0).max(360).optional(),
  /** Cuándo se tomó la lectura (ISO 8601 con zona), no cuándo se envió. */
  recordedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
});
export type PingDto = z.infer<typeof pingSchema>;

export const pingBatchSchema = z.strictObject({
  routeRunId: z.uuid(),
  pings: z
    .array(pingSchema)
    .min(1)
    .max(MAX_PINGS_PER_BATCH)
    .refine((pings) => new Set(pings.map((p) => p.id)).size === pings.length, {
      message: 'Hay posiciones con el mismo id en el lote',
    }),
});
export type PingBatchDto = z.infer<typeof pingBatchSchema>;

export const liveQuerySchema = z.object({
  providerId: z.uuid().optional(),
});
export type LiveQuery = z.infer<typeof liveQuerySchema>;
