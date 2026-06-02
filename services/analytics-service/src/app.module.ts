import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config/configuration.js';
import { AppConfigModule } from './config/app-config.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { EventArchiveModule } from './modules/event-archive/event-archive.module.js';

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
    PrismaModule,
    HealthModule,
    EventArchiveModule,
  ],
})
export class AppModule {}
