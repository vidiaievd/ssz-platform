import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { configuration, validationSchema } from './config/configuration';
import { RabbitMQModule } from './infrastructure/messaging/rabbitmq.module';
import { RedisModule } from './infrastructure/cache/redis.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { StudentsModule } from './modules/students/students.module';
import { TutorsModule } from './modules/tutors/tutors.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [
    // Configuration — loaded first so all other modules can inject ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),

    // Structured JSON logging via Pino
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        // Redact Authorization headers from access logs
        redact: ['req.headers.authorization'],
      },
    }),

    // Infrastructure — global modules available everywhere
    RabbitMQModule,
    RedisModule,

    // Feature modules
    ProfilesModule,
    StudentsModule,
    TutorsModule,
    PreferencesModule,
    EventsModule,
  ],
})
export class AppModule {}
