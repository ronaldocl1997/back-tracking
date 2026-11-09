import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Public } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { Throttle } from '@nestjs/throttler';
import { AccessPolicy } from './access.policy.js';
import type { AuthUser } from './auth-user.js';
import {
  loginSchema,
  refreshTokenSchema,
  type LoginDto,
  type RefreshTokenDto,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

/** Máximo 5 intentos por minuto en las rutas públicas de auth (por IP). */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Devuelve `{ accessToken, refreshToken, expiresIn }`. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Body({ schema: loginSchema }) body: LoginDto) {
    return this.auth.login(body);
  }

  /** Cambia un refresh token por un par nuevo. Cada refresh token sirve una sola vez. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto) {
    await this.auth.logout(body.refreshToken);
  }

  @Can(AccessPolicy, 'signedIn')
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.auth.logoutAll(user.id);
  }

  @Can(AccessPolicy, 'signedIn')
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user);
  }
}
