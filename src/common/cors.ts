import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * Orígenes permitidos para CORS, desde CORS_ORIGINS (separados por coma).
 * Un `*` en lugar del puerto acepta cualquier puerto: `http://localhost:*`.
 *
 * CORS solo aplica a navegadores. La app móvil y las llamadas entre servidores
 * no envían `Origin` y no se ven afectadas.
 */
export function parseCorsOrigins(value: string): RegExp[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((origin) => {
      const pattern = origin
        .split(':*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join(':\\d{1,5}');
      return new RegExp(`^${pattern}$`, 'i');
    });
}

export function isAllowedOrigin(origin: string, allowed: RegExp[]): boolean {
  return allowed.some((pattern) => pattern.test(origin));
}

export function corsOptions(value: string): CorsOptions {
  const allowed = parseCorsOrigins(value);
  return {
    origin: (origin, callback) =>
      // Sin Origin (app móvil, curl, servidor a servidor): no es una petición CORS.
      callback(null, !origin || isAllowedOrigin(origin, allowed)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    // La API usa tokens Bearer, no cookies: no hace falta enviar credenciales.
    credentials: false,
    // El navegador recuerda la respuesta del preflight 10 minutos.
    maxAge: 600,
  };
}
