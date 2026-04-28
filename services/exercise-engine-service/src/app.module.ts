import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config/configuration.js';
import { AppConfigModule } from './config/app-config.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { JwtModule } from './infrastructure/auth/jwt.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { RabbitmqModule } from './infrastructure/messaging/rabbitmq.module.js';
import { RedisModule } from './infrastructure/cache/redis.module.js';
import { HttpClientsModule } from './infrastructure/http/http.module.js';
import { ValidationModule } from './infrastructure/validation/validation.module.js';
import { FeedbackModule } from './infrastructure/feedback/feedback.module.js';
import { AttemptsModule } from './modules/attempts/attempts.module.js';
import { EventsModule } from './modules/events/events.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const isDev = config.get<AppConfig['app']>('app')?.nodeEnv !== 'production';
        const level = config.get<AppConfig['app']>('app')?.logLevel ?? 'info';

        return {
          pinoHttp: {
            transport: isDev
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: false } }
              : undefined,
            level,
            redact: ['req.headers.authorization', 'req.headers["x-internal-token"]'],
          },
        };
      },
    }),
    JwtModule,
    PrismaModule,
    RabbitmqModule,
    RedisModule,
    HttpClientsModule,
    ValidationModule,
    FeedbackModule,
    CqrsModule.forRoot(),
    AttemptsModule,
    EventsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
