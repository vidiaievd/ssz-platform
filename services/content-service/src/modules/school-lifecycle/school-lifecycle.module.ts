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
import { CleanupObsoleteCoursesHandler } from './application/commands/cleanup-obsolete-courses.handler.js';
import { PurgeSchoolMaterialsHandler } from './application/commands/purge-school-materials.handler.js';
import { RunContentCleanupHandler } from './application/commands/run-content-cleanup.handler.js';
import { ACTIVE_LEARNERS_READER } from './application/ports/active-learners.reader.port.js';
import { CONTENT_CLEANUP_LOCK } from './application/ports/cleanup-lock.port.js';
import { SCHOOL_MATERIALS_STORE } from './application/ports/school-materials.store.port.js';
import { SCHOOL_PURGE_LEDGER } from './application/ports/school-purge.ledger.port.js';
import { SchoolLifecycleConsumer } from './infrastructure/events/school-lifecycle.consumer.js';
import { HttpActiveLearnersReader } from './infrastructure/http/http-active-learners.reader.js';
import { ContentCleanupAdvisoryLock } from './infrastructure/persistence/content-cleanup.advisory-lock.js';
import { SchoolMaterialsPrismaStore } from './infrastructure/persistence/school-materials.prisma.store.js';
import { SchoolPurgePrismaLedger } from './infrastructure/persistence/school-purge.prisma.ledger.js';
import { ContentCleanupJob } from './presentation/jobs/content-cleanup.job.js';

/**
 * A school's lifecycle in content (plan 90, phase 5, step 4b): the maintenance status of its
 * courses follows `school.closed` / `school.restored`, and `school.purged` deletes what nobody
 * else uses. A job (step 4c) finishes purges that failed and deletes obsolete courses nobody
 * holds any more. The rules are in `domain/`; organization owns the school itself.
 */
@Module({
  imports: [CqrsModule],
  providers: [
    SchoolLifecycleConsumer,
    ApplySchoolClosedHandler,
    ApplySchoolRestoredHandler,
    PurgeSchoolMaterialsHandler,
    CleanupObsoleteCoursesHandler,
    RunContentCleanupHandler,
    ContentCleanupJob,
    { provide: SCHOOL_MATERIALS_STORE, useClass: SchoolMaterialsPrismaStore },
    { provide: ACTIVE_LEARNERS_READER, useClass: HttpActiveLearnersReader },
    { provide: SCHOOL_PURGE_LEDGER, useClass: SchoolPurgePrismaLedger },
    { provide: CONTENT_CLEANUP_LOCK, useClass: ContentCleanupAdvisoryLock },
    {
      provide: SCHOOL_PURGE_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>): SchoolPurgeSettings => {
        const { activeDays, obsoleteGraceHours, purgeRetryAfterMs } =
          config.get<AppConfig['schoolPurge']>('schoolPurge')!;
        return { activeDays, obsoleteGraceHours, purgeRetryAfterMs };
      },
    },
  ],
})
export class SchoolLifecycleModule {}
