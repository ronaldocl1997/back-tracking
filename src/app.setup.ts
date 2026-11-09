import { StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { corsOptions } from './common/cors.js';
import type { Env } from './config/env.schema.js';

/**
 * Configuración HTTP de la app. La usan `main.ts` y las pruebas e2e, para que
 * las pruebas corran contra la app tal como se despliega.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.enableCors(corsOptions(config.get('CORS_ORIGINS', { infer: true })));

  // Un lote de 500 posiciones ronda los 100 KB, el límite por defecto de Express.
  app.useBodyParser('json', { limit: '1mb' });
  // Valida los @Body/@Query/@Param que declaran { schema } (Zod).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
}
