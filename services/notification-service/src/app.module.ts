import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config/configuration.js';
import { AppConfigModule } from './config/app-config.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { RabbitmqModule } from './infrastructure/messaging/rabbitmq.module.js';
import { EmailModule } from './infrastructure/email/email.module.js';
import { AuthModule } from './infrastructure/auth/auth.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RABBITMQ_HANDLERS } from './infrastructure/messaging/message-handler.interface.js';
import type { IMessageHandler } from './infrastructure/messaging/message-handler.interface.js';
import { UserRegisteredHandler } from './modules/notifications/handlers/user-registered.handler.js';
import { EmailVerificationHandler } from './modules/notifications/handlers/email-verification.handler.js';
import { PasswordResetHandler } from './modules/notifications/handlers/password-reset.handler.js';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
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
    RabbitmqModule,
    EmailModule,
    HealthModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: RABBITMQ_HANDLERS,
      useFactory: (h1: UserRegisteredHandler, h2: EmailVerificationHandler, h3: PasswordResetHandler): IMessageHandler[] => [h1, h2, h3],
      inject: [UserRegisteredHandler, EmailVerificationHandler, PasswordResetHandler],
    },
  ],
})
export class AppModule {}
