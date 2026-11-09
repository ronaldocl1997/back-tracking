import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Traduce los errores conocidos de Prisma a respuestas HTTP claras, en lugar
 * de un 500 genérico. Los demás errores siguen su camino normal.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const response = host.switchToHttp().getResponse<unknown>();
    const [statusCode, message] = this.map(error);

    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(error.message, error.stack);
    }

    httpAdapter.reply(
      response,
      { statusCode, error: HttpStatus[statusCode], message },
      statusCode,
    );
  }

  private map(error: Prisma.PrismaClientKnownRequestError): [number, string] {
    switch (error.code) {
      case 'P2002': {
        const fields = this.fields(error);
        return [
          HttpStatus.CONFLICT,
          fields
            ? `Ya existe un registro con el mismo valor en: ${fields}`
            : 'Ya existe un registro con esos datos',
        ];
      }
      case 'P2003':
        return [
          HttpStatus.CONFLICT,
          'El registro está relacionado con otros datos y no se puede modificar así',
        ];
      case 'P2025':
        return [HttpStatus.NOT_FOUND, 'Registro no encontrado'];
      default:
        return [HttpStatus.INTERNAL_SERVER_ERROR, 'Error de base de datos'];
    }
  }

  private fields(error: Prisma.PrismaClientKnownRequestError): string | null {
    const target = (error.meta as { target?: unknown } | undefined)?.target;
    if (Array.isArray(target)) return target.join(', ');
    if (typeof target === 'string') return target;
    return null;
  }
}
