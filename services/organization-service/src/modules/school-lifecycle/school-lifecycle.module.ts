import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import type { Env } from '../../config/configuration.js';
import {
  ChangeSchoolStatusHandler,
  LIFECYCLE_CLOCK,
  LIFECYCLE_TERMS,
  type LifecycleClock,
} from './application/commands/change-school-status.handler.js';
import type { LifecycleTerms } from './domain/school-lifecycle.js';
import { SCHOOL_LIFECYCLE_REPOSITORY } from './domain/school-lifecycle.repository.js';
import { SchoolLifecyclePrismaRepository } from './infrastructure/school-lifecycle.prisma.repository.js';
import { AdminSchoolLifecycleController } from './presentation/admin-school-lifecycle.controller.js';

/** A school's lifecycle: status, moves, trail (plan 90, phase 5). */
@Module({
  imports: [CqrsModule],
  controllers: [AdminSchoolLifecycleController],
  providers: [
    ChangeSchoolStatusHandler,
    { provide: SCHOOL_LIFECYCLE_REPOSITORY, useClass: SchoolLifecyclePrismaRepository },
    {
      provide: LIFECYCLE_TERMS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>): LifecycleTerms => ({
        suspendDays: config.get('SCHOOL_SUSPEND_DAYS') ?? 30,
        archiveDays: config.get('SCHOOL_ARCHIVE_DAYS') ?? 183,
      }),
    },
    { provide: LIFECYCLE_CLOCK, useValue: (() => new Date()) satisfies LifecycleClock },
  ],
})
export class SchoolLifecycleModule {}
