import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BEARER } from '../../swagger.js';
import type { ModelName } from './models.js';

/**
 * Decoradores de documentación. Mantienen cada endpoint documentado en pocas
 * líneas y con el mismo formato en toda la API.
 */

const ref = (model: ModelName) => ({ $ref: `#/components/schemas/${model}` });

type Role = 'ADMIN' | 'PROVIDER' | 'SUPERVISOR' | 'EMPLOYEE' | 'Público';

/** Controlador con sesión: etiqueta + seguridad bearer + 401/403. */
export function ApiProtectedController(tag: string) {
  return applyDecorators(
    ApiTags(tag),
    ApiBearerAuth(BEARER),
    ApiError(401, 'Sin token, token vencido o usuario desactivado'),
    ApiError(403, 'Tu rol no tiene permiso para esta operación'),
  );
}

/** Resumen, descripción y roles que pueden usar el endpoint. */
export function ApiDoc(
  summary: string,
  { roles, description }: { roles: Role[]; description?: string },
) {
  const who = `**Roles:** ${roles.map((r) => (r === 'Público' ? r : `\`${r}\``)).join(', ')}`;
  return ApiOperation({
    summary,
    description: description ? `${who}\n\n${description}` : who,
  });
}

/** Respuesta exitosa con un modelo (o lista de modelos). */
export function ApiOk(
  model: ModelName,
  { status = 200, description = 'OK', array = false } = {},
) {
  return ApiResponse({
    status,
    description,
    schema: array ? { type: 'array', items: ref(model) } : ref(model),
  });
}

export function ApiCreated(model: ModelName, description = 'Creado') {
  return ApiOk(model, { status: 201, description });
}

/** Lista paginada: `{ data: Model[], meta: PaginationMeta }`. */
export function ApiPaginated(model: ModelName, description = 'Página de resultados') {
  return ApiResponse({
    status: 200,
    description,
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: { type: 'array', items: ref(model) },
        meta: ref('PaginationMeta'),
      },
    },
  });
}

export function ApiNoContent(description = 'Hecho, sin contenido') {
  return ApiResponse({ status: 204, description });
}

const ERROR_TEXT: Record<number, string> = {
  400: 'Datos inválidos: `message` dice qué campo y por qué',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No existe o pertenece a otro proveedor',
  409: 'Conflicto con el estado actual',
  429: 'Demasiados intentos; espera un minuto',
};

/** Una respuesta de error con el formato común `{ statusCode, error, message }`. */
export function ApiError(status: number, description = ERROR_TEXT[status] ?? 'Error') {
  return ApiResponse({ status, description, schema: ref('ErrorResponse') });
}
