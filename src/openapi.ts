/**
 * Genera openapi.json sin levantar el servidor ni conectar a la base:
 *   npm run openapi   → ./openapi.json
 * Útil para generar el cliente del front o de la app móvil.
 */
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createOpenApiDocument } from './swagger.js';

process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.JWT_SECRET ??= 'solo-para-generar-la-documentacion-0123456789';

const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
const document = createOpenApiDocument(app);
const out = process.argv[2] ?? 'openapi.json';
writeFileSync(out, JSON.stringify(document, null, 2));
console.log(
  `${out}: ${Object.keys(document.paths).length} rutas, ${Object.values(document.paths).reduce((n, p) => n + Object.keys(p).length, 0)} operaciones`,
);
await app.close();
