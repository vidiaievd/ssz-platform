import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppConfigModule } from './config/app-config.module.js';
import { Env } from './config/configuration.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ProfilesModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => {
        const isDev = config.get('NODE_ENV') !== 'production';
        return {
          pinoHttp: {
            // Pretty-print in development, plain JSON in production.
            // pino-pretty is a dev dependency and is never bundled in prod.
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: false },
                }
              : undefined,
            level: isDev ? 'debug' : 'info',
            // Redact sensitive headers from logs
            redact: ['req.headers.authorization'],
          },
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
