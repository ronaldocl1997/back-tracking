import { z } from 'zod';

export const MAX_PINGS_PER_BATCH = 500;

const pingSchema = z.strictObject({
  id: z.uuid().meta({
    description:
      'UUID generado por el celular para esta posición: si el lote se reenvía, no se duplica',
    example: '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b',
  }),
  latitude: z.number().min(-90).max(90).meta({ example: 20.67412 }),
  longitude: z.number().min(-180).max(180).meta({ example: -103.34871 }),
  accuracyM: z
    .number()
    .min(0)
    .max(10_000)
    .optional()
    .meta({ description: 'Precisión que reporta el GPS, en metros', example: 8.5 }),
  speedMps: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .meta({ description: 'Velocidad en m/s', example: 4.2 }),
  heading: z
    .number()
    .min(0)
    .max(360)
    .optional()
    .meta({ description: 'Rumbo en grados (0 = norte)', example: 182 }),
  recordedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .meta({
      description: 'Cuándo se tomó la lectura, ISO 8601 con zona (no cuándo se envía)',
      example: '2026-11-17T14:03:22.120Z',
    }),
});
export type PingDto = z.infer<typeof pingSchema>;

export const pingBatchSchema = z.strictObject({
  routeRunId: z.uuid().meta({
    description: 'El recorrido en curso (de GET /my/runs)',
    example: '019a6f3e-8c2b-7d41-9e0a-3b5c7d9e1f20',
  }),
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
  providerId: z
    .uuid()
    .optional()
    .meta({ description: 'Solo ADMIN: filtra por proveedor' }),
});
export type LiveQuery = z.infer<typeof liveQuerySchema>;
