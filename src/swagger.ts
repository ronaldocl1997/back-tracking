import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { modelSchemas } from './common/openapi/models.js';

export const BEARER = 'bearer';

/** Etiquetas en el orden en que aparecen en la documentación. */
export const TAGS = {
  auth: 'Auth',
  users: 'Usuarios',
  providers: 'Proveedores',
  team: 'Equipo',
  employees: 'Empleados',
  clients: 'Clientes',
  routes: 'Rutas',
  schedules: 'Asignaciones',
  runs: 'Recorridos',
  tracking: 'Tracking',
  my: 'App del empleado',
  health: 'Estado',
} as const;

const TAG_DESCRIPTIONS: Record<keyof typeof TAGS, string> = {
  auth: 'Inicio de sesión, renovación de tokens y perfil del usuario autenticado.',
  users: 'Todas las cuentas del sistema. **Solo ADMIN.**',
  providers: 'Empresas que usan el sistema. ADMIN las gestiona; el dueño ve y edita la suya.',
  team: 'Equipo de oficina de un proveedor: dueños (`PROVIDER`) y supervisores (`SUPERVISOR`). **ADMIN y dueño.**',
  employees: 'Choferes y acompañantes del proveedor, y sus cuentas para la app. **ADMIN, dueño y supervisor.**',
  clients: 'Clientes del proveedor con su ubicación y radio de llegada (geofence). **ADMIN, dueño y supervisor.**',
  routes: 'Rutas y sus paradas (clientes en orden de visita). **ADMIN, dueño y supervisor.**',
  schedules: 'Plan semanal: qué chofer hace qué ruta cada día y con qué acompañantes. **ADMIN, dueño y supervisor.**',
  runs: 'Recorridos de cada día generados desde las asignaciones: monitoreo, correcciones, mapa. **ADMIN, dueño y supervisor.**',
  tracking: 'Recepción de posiciones GPS del chofer y mapa en vivo.',
  my: 'Lo que usa la app del chofer y del acompañante. **Solo EMPLOYEE.**',
  health: 'Comprobación de que la API responde.',
};

const DESCRIPTION = `
API para monitorear choferes en ruta: el chofer envía su ubicación desde el celular y el backend decide qué clientes visitó.

## Autenticación
1. \`POST /auth/login\` devuelve \`accessToken\` (15 min), \`refreshToken\` y \`expiresIn\`.
2. Envía \`Authorization: Bearer <accessToken>\` en cada petición. En esta página: botón **Authorize**.
3. Antes de que expire, \`POST /auth/refresh\` con el \`refreshToken\` devuelve un par nuevo. **Cada refresh token sirve una sola vez**: reusarlo cierra esa sesión en todos sus tokens (se asume robo).

## Roles
| Rol | Alcance |
|---|---|
| \`ADMIN\` | Todo, en todos los proveedores. Donde se crea algo de un proveedor debe indicar \`providerId\`. |
| \`PROVIDER\` | Dueño o gerente: todo lo de su proveedor, incluido su equipo. |
| \`SUPERVISOR\` | Opera clientes, empleados, rutas, asignaciones y recorridos de su proveedor. |
| \`EMPLOYEE\` | Chofer o acompañante: solo las rutas \`/my/*\` y, el chofer, \`POST /tracking/pings\`. |

Cada endpoint indica en su descripción qué roles lo pueden usar. **Un usuario nunca ve datos de otro proveedor**: pedir un registro ajeno responde \`404\`, como si no existiera.

## Convenciones
- **Paginación:** \`?page=1&limit=20\` (máximo 100). Las listas responden \`{ data: [...], meta: { page, limit, total, totalPages } }\`.
- **Fechas:** instantes en ISO 8601 UTC (\`2026-11-17T14:03:22.120Z\`); días en \`YYYY-MM-DD\`, en la zona horaria del proveedor.
- **Bajas:** \`DELETE\` de empleados, clientes y rutas es lógico (\`isActive = false\`); se conservan para el historial.
- **PATCH:** solo cambia los campos enviados; en campos opcionales, \`null\` los borra.
- **Campos desconocidos** en el cuerpo se rechazan con \`400\`.

## Errores
Todas las respuestas de error tienen la forma \`{ statusCode, error, message }\`.

| Código | Cuándo |
|---|---|
| \`400\` | Datos inválidos (\`message\` lista los campos) |
| \`401\` | Sin token, token vencido o usuario desactivado |
| \`403\` | El rol no tiene permiso para esa ruta |
| \`404\` | No existe, o pertenece a otro proveedor |
| \`409\` | Conflicto: duplicado o estado que no permite la acción |
| \`429\` | Demasiadas peticiones (login: 5 por minuto por IP) |
`;

export function buildOpenApiConfig() {
  const builder = new DocumentBuilder()
    .setTitle('back-tracking API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'El `accessToken` de `POST /auth/login`.',
      },
      BEARER,
    );
  for (const key of Object.keys(TAGS) as (keyof typeof TAGS)[]) {
    builder.addTag(TAGS[key], TAG_DESCRIPTIONS[key]);
  }
  return builder.build();
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, buildOpenApiConfig(), {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    // Las etiquetas vienen de @ApiTags / ApiProtectedController, en español.
    autoTagControllers: false,
  });
  // Modelos de respuesta (Zod → JSON Schema), referenciados como #/components/schemas/<Nombre>.
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ...(modelSchemas() as NonNullable<OpenAPIObject['components']>['schemas']),
  };
  return document;
}

/** UI en `/docs` y el documento OpenAPI en `/docs/json` (para generar clientes). */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/json',
    customSiteTitle: 'back-tracking API',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
  });
}
