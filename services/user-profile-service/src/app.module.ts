import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { AppConfigModule } from './config/app-config.module.js';
import type { Env } from './config/configuration.js';
import { AuthModule } from './infrastructure/auth/auth.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    PrismaModule,
    ProfilesModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => {
        const isDev = config.get('NODE_ENV') !== 'production';
        return {
          pinoHttp: {
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: false },
                }
              : undefined,
            level: isDev ? 'debug' : 'info',
            redact: ['req.headers.authorization'],
          },
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    // Register JwtAuthGuard as a global guard via APP_GUARD token.
    // Every route is protected by default; use @Public() to opt out.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
