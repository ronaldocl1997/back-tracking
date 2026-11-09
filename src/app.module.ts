import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { envSchema, type Env } from './config/env.schema.js';
import { EmployeesModule } from './employees/employees.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { RoutesModule } from './routes/routes.module.js';
import { RunsModule } from './runs/runs.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { TeamModule } from './team/team.module.js';
import { TrackingModule } from './tracking/tracking.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    // Límite general por IP; las rutas de login lo endurecen con @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    ScheduleModule.forRoot(),

    // Orden importante: primero autenticación (pone request.user), luego autorización.
    // Toda ruta exige sesión salvo @Public(), y exige @Can() para entrar.
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        accessToken: {
          key: config.get('JWT_SECRET', { infer: true }),
          issuer: config.get('JWT_ISSUER', { infer: true }),
          audience: config.get('JWT_AUDIENCE', { infer: true }),
          ttl: config.get('ACCESS_TOKEN_TTL', { infer: true }),
        },
        refreshToken: {
          ttl: config.get('REFRESH_TOKEN_TTL', { infer: true }),
          absoluteTtl: config.get('REFRESH_TOKEN_ABSOLUTE_TTL', { infer: true }),
        },
      }),
    }),
    AuthorizationModule.forRoot(),

    AuthModule,
    UsersModule,
    ProvidersModule,
    TeamModule,
    EmployeesModule,
    ClientsModule,
    RoutesModule,
    SchedulesModule,
    RunsModule,
    TrackingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
