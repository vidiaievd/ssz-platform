import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config/configuration.js';
import { AppConfigModule } from './config/app-config.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { JwtModule } from './infrastructure/auth/jwt.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { RabbitmqModule } from './infrastructure/messaging/rabbitmq.module.js';
import { RedisModule } from './infrastructure/cache/redis.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ContainerModule } from './modules/container/container.module.js';
import { LessonModule } from './modules/lesson/lesson.module.js';
import { VocabularyModule } from './modules/vocabulary/vocabulary.module.js';
import { ExerciseTemplateModule } from './modules/exercise-template/exercise-template.module.js';
import { ExerciseModule } from './modules/exercise/exercise.module.js';
import { GrammarRuleModule } from './modules/grammar-rule/grammar-rule.module.js';
import { AccessControlModule } from './shared/access-control/access-control.module.js';
import { AccessControlWiringModule } from './shared/access-control/access-control-wiring.module.js';
import { TagModule } from './modules/tag/tag.module.js';

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
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: false },
                }
              : undefined,
            level,
            redact: ['req.headers.authorization'],
          },
        };
      },
    }),
    JwtModule,
    PrismaModule,
    RabbitmqModule,
    RedisModule,
    CqrsModule,
    ScheduleModule.forRoot(),
    HealthModule,
    ContainerModule,
    LessonModule,
    VocabularyModule,
    ExerciseTemplateModule,
    ExerciseModule,
    GrammarRuleModule,
    AccessControlModule,
    AccessControlWiringModule,
    TagModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
