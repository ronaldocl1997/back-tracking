import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupSwagger } from './swagger.js';
import type { Env } from './config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  const swagger = config.get('SWAGGER_ENABLED', { infer: true });
  if (swagger) setupSwagger(app);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  const baseUrl = `http://localhost:${port}`;
  logger.log(`API escuchando en ${baseUrl}`);
  if (swagger) {
    logger.log(`Swagger: ${baseUrl}/docs  (OpenAPI: ${baseUrl}/docs/json)`);
  } else {
    logger.log('Swagger desactivado (SWAGGER_ENABLED=false)');
  }
}
await bootstrap();
