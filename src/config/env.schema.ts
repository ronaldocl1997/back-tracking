import { z } from 'zod';

/** Variables de entorno, validadas al arrancar. Si falta algo, la app no inicia. */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),

  /** Secreto HS256 para firmar los access tokens. Mínimo 32 caracteres. */
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('back-tracking'),
  JWT_AUDIENCE: z.string().default('back-tracking-clients'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  /** Tiempo máximo de una sesión aunque se renueve: después hay que volver a iniciar sesión. */
  REFRESH_TOKEN_ABSOLUTE_TTL: z.string().default('90d'),

  /** Segundos que el chofer debe seguir dentro del radio para confirmar la visita. */
  VISIT_DWELL_SECONDS: z.coerce.number().int().min(0).default(120),
  /** Posiciones con peor precisión (metros) se guardan pero no deciden visitas. */
  VISIT_MAX_ACCURACY_M: z.coerce.number().positive().default(50),
  /** Tolerancia para relojes de celular adelantados al recibir posiciones. */
  PING_MAX_FUTURE_SKEW_SECONDS: z.coerce.number().int().min(0).default(120),
  /**
   * Días que se guardan las posiciones GPS (el trazo). 0 = para siempre.
   * Las visitas y los recorridos nunca se borran: solo el trazo detallado.
   */
  PING_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),

  /** Documentación Swagger en /docs (y /docs/json). Desactívala si la API es pública y no quieres exponerla. */
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /** Peticiones por minuto y por IP en toda la API. */
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  /** Intentos por minuto y por IP en login y refresh. */
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;
