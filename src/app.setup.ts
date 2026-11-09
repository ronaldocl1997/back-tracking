import { StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { corsOptions } from './common/cors.js';
import type { Env } from './config/env.schema.js';

export interface AppSetupOptions {
  /** Sobrescribe TRUST_PROXY (lo usan las pruebas). */
  trustProxy?: number;
}

/**
 * Configuración HTTP de la app. La usan `main.ts` y las pruebas e2e, para que
 * las pruebas corran contra la app tal como se despliega.
 */
export function configureApp(
  app: NestExpressApplication,
  options: AppSetupOptions = {},
): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Cuántos proxies (balanceador, Nginx, Cloudflare…) hay delante. Con N > 0,
  // Express toma la IP real del cliente de X-Forwarded-For, saltando N saltos;
  // así el límite de intentos cuenta por usuario y no por balanceador.
  // 0 (sin proxy): se ignora X-Forwarded-For, que el cliente podría falsificar.
  const trustProxy = options.trustProxy ?? config.get('TRUST_PROXY', { infer: true });
  app.set('trust proxy', trustProxy > 0 ? trustProxy : false);

  // Cabeceras de seguridad (nosniff, anti-iframe, HSTS, CSP…) y sin X-Powered-By.
  app.use(helmet());

  app.enableCors(corsOptions(config.get('CORS_ORIGINS', { infer: true })));
  // Un lote de 500 posiciones ronda los 100 KB, el límite por defecto de Express.
  app.useBodyParser('json', { limit: '1mb' });
  // Valida los @Body/@Query/@Param que declaran { schema } (Zod).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
}
