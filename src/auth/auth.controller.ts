import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Public } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiDoc,
  ApiError,
  ApiNoContent,
  ApiOk,
} from '../common/openapi/decorators.js';
import { BEARER, TAGS } from '../swagger.js';
import { AccessPolicy } from './access.policy.js';
import type { AuthUser } from './auth-user.js';
import {
  loginSchema,
  refreshTokenSchema,
  type LoginDto,
  type RefreshTokenDto,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

/**
 * Intentos por minuto y por IP en login y refresh (THROTTLE_AUTH_LIMIT, 5 por
 * defecto). Se lee en cada petición: ConfigModule ya validó y cargó el valor.
 */
const AUTH_THROTTLE = {
  default: {
    limit: () => Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
    ttl: 60_000,
  },
};

@ApiTags(TAGS.auth)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  @ApiDoc('Iniciar sesión', {
    roles: ['Público'],
    description:
      'Devuelve el par de tokens. Usuarios desactivados, o de un proveedor desactivado, no pueden entrar. ' +
      'El mensaje de error es el mismo para correo inexistente y contraseña incorrecta. Máximo 5 intentos por minuto por IP.',
  })
  @ApiOk('TokenPair')
  @ApiError(400)
  @ApiError(401, 'Credenciales inválidas')
  @ApiError(429)
  login(@Body({ schema: loginSchema }) body: LoginDto) {
    return this.auth.login(body);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  @ApiDoc('Renovar tokens', {
    roles: ['Público'],
    description:
      'Cambia un refresh token por un par nuevo; el anterior deja de servir. ' +
      'Presentar uno ya usado se trata como robo: se revoca toda la sesión y hay que volver a iniciar sesión.',
  })
  @ApiOk('TokenPair')
  @ApiError(400)
  @ApiError(401, 'Refresh token inválido, vencido o reusado')
  @ApiError(429)
  refresh(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiDoc('Cerrar sesión en este dispositivo', {
    roles: ['Público'],
    description: 'Revoca la sesión del refresh token. Responde 204 aunque el token no exista, para no revelar nada.',
  })
  @ApiNoContent()
  @ApiError(400)
  async logout(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto) {
    await this.auth.logout(body.refreshToken);
  }

  @Can(AccessPolicy, 'signedIn')
  @Post('logout-all')
  @HttpCode(204)
  @ApiBearerAuth(BEARER)
  @ApiDoc('Cerrar sesión en todos los dispositivos', {
    roles: ['ADMIN', 'PROVIDER', 'SUPERVISOR', 'EMPLOYEE'],
    description: 'Revoca todos los refresh tokens del usuario. Los access tokens ya emitidos siguen hasta vencer (máx. 15 min).',
  })
  @ApiNoContent()
  @ApiError(401)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.auth.logoutAll(user.id);
  }

  @Can(AccessPolicy, 'signedIn')
  @Get('me')
  @ApiBearerAuth(BEARER)
  @ApiDoc('Mi perfil', {
    roles: ['ADMIN', 'PROVIDER', 'SUPERVISOR', 'EMPLOYEE'],
    description: 'Usuario autenticado, su proveedor (oficina) o sus perfiles de empleado (uno por proveedor).',
  })
  @ApiOk('Profile')
  @ApiError(401)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user);
  }
}
