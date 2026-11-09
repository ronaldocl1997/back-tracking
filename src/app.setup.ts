import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Configuración HTTP de la app. La usan `main.ts` y las pruebas e2e, para que
 * las pruebas corran contra la app tal como se despliega.
 */
export function configureApp(app: NestExpressApplication): void {
  // Un lote de 500 posiciones ronda los 100 KB, el límite por defecto de Express.
  app.useBodyParser('json', { limit: '1mb' });
  // Valida los @Body/@Query/@Param que declaran { schema } (Zod).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
}
