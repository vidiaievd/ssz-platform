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
import { HealthModule } from './modules/health/health.module.js';
import { AssignmentsModule } from './modules/assignments/assignments.module.js';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';
import { ReviewModule } from './modules/review/review.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';

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
    CqrsModule,
    HealthModule,
    AssignmentsModule,
    EnrollmentsModule,
    ProgressModule,
    ReviewModule,
    EventsModule,
    JobsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
