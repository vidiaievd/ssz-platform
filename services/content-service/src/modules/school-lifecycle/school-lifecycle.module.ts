import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import type { AppConfig } from '../../config/configuration.js';
import {
  SCHOOL_PURGE_SETTINGS,
  type SchoolPurgeSettings,
} from './application/commands/school-lifecycle.commands.js';
import {
  ApplySchoolClosedHandler,
  ApplySchoolRestoredHandler,
} from './application/commands/school-maintenance.handlers.js';
import { PurgeSchoolMaterialsHandler } from './application/commands/purge-school-materials.handler.js';
import { ACTIVE_LEARNERS_READER } from './application/ports/active-learners.reader.port.js';
import { SCHOOL_MATERIALS_STORE } from './application/ports/school-materials.store.port.js';
import { SchoolLifecycleConsumer } from './infrastructure/events/school-lifecycle.consumer.js';
import { HttpActiveLearnersReader } from './infrastructure/http/http-active-learners.reader.js';
import { SchoolMaterialsPrismaStore } from './infrastructure/persistence/school-materials.prisma.store.js';

/**
 * A school's lifecycle in content (plan 90, phase 5, step 4b): the maintenance status of its
 * courses follows `school.closed` / `school.restored`, and `school.purged` deletes what nobody
 * else uses. The rules are in `domain/`; organization owns the school itself.
 */
@Module({
  imports: [CqrsModule],
  providers: [
    SchoolLifecycleConsumer,
    ApplySchoolClosedHandler,
    ApplySchoolRestoredHandler,
    PurgeSchoolMaterialsHandler,
    { provide: SCHOOL_MATERIALS_STORE, useClass: SchoolMaterialsPrismaStore },
    { provide: ACTIVE_LEARNERS_READER, useClass: HttpActiveLearnersReader },
    {
      provide: SCHOOL_PURGE_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>): SchoolPurgeSettings => ({
        activeDays: config.get<AppConfig['schoolPurge']>('schoolPurge')!.activeDays,
      }),
    },
  ],
})
export class SchoolLifecycleModule {}
