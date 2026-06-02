import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config/configuration.js';
import { AppConfigModule } from './config/app-config.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { JwtModule } from './infrastructure/auth/jwt.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { EventArchiveModule } from './modules/event-archive/event-archive.module.js';
import { ProjectionsModule } from './modules/projections/projections.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const isDev = config.get<AppConfig['app']>('app')?.nodeEnv !== 'production';
        const level = config.get<AppConfig['app']>('app')?.logLevel ?? 'debug';
        return {
          pinoHttp: {
            transport: isDev
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: false } }
              : undefined,
            level,
            redact: ['req.headers.authorization'],
          },
        };
      },
    }),
    CqrsModule,
    PrismaModule,
    JwtModule,
    HealthModule,
    EventArchiveModule,
    ProjectionsModule,
    MetricsModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
