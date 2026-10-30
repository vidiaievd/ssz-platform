import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { RedisModule } from './infrastructure/cache/redis.module.js';
import { JwtModule } from './infrastructure/auth/jwt.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { CapabilitiesModule } from './modules/capabilities/capabilities.module.js';
import { GatewayModule } from './modules/gateway/gateway.module.js';
import { ProvidersModule } from './modules/providers/providers.module.js';
import { RegistryModule } from './modules/registry/registry.module.js';
import { UserErasureModule } from './modules/user-erasure/user-erasure.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
        // Learners' tokens reach this service since the assistant's routes (plan 83, step 5).
        redact: ['req.headers.authorization', 'req.headers["x-internal-token"]'],
      },
    }),
    CqrsModule.forRoot(),
    PrismaModule,
    RedisModule,
    JwtModule,
    HealthModule,
    ProvidersModule,
    RegistryModule,
    AccessModule,
    GatewayModule,
    CapabilitiesModule,
    UserErasureModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
