import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { JwtModule } from './infrastructure/auth/jwt.module.js';
import { RabbitMqModule } from './infrastructure/messaging/rabbitmq.module.js';
import { OrgConsumerModule } from './infrastructure/messaging/org-consumer.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { ProjectionsModule } from './modules/projections/projections.module.js';
import { SlotsModule } from './modules/slots/slots.module.js';
import { WorkloadModule } from './modules/workload/workload.module.js';
import { ClashesModule } from './modules/clashes/clashes.module.js';
import { AbsencesModule } from './modules/absences/absences.module.js';
import { SubstitutionsModule } from './modules/substitutions/substitutions.module.js';
import { CurriculumModule } from './modules/curriculum/curriculum.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({ pinoHttp: { level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug' } }),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    JwtModule,
    RabbitMqModule,
    OrgConsumerModule,
    HealthModule,
    ProjectionsModule,
    SlotsModule,
    WorkloadModule,
    ClashesModule,
    AbsencesModule,
    SubstitutionsModule,
    CurriculumModule,
    AlertsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
