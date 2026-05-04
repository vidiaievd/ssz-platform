import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { SRS_REPOSITORY } from './domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER } from './application/ports/srs-scheduler.port.js';
import { SRS_LIMITS_POLICY } from './application/ports/srs-limits-policy.port.js';
import { CLOCK, SystemClock } from '../../shared/application/ports/clock.port.js';

// Infrastructure
import { FsrsScheduler } from './infrastructure/scheduler/fsrs-scheduler.js';
import { RedisSrsLimitsPolicy } from './infrastructure/cache/redis-srs-limits-policy.js';
import { RedisDueQueueService } from './infrastructure/cache/redis-due-queue.service.js';
import { PrismaSrsRepository } from './infrastructure/persistence/prisma-srs.repository.js';

// Command handlers
import { IntroduceCardHandler } from './application/commands/introduce-card.handler.js';
import { ReviewCardHandler } from './application/commands/review-card.handler.js';
import { SuspendCardHandler } from './application/commands/suspend-card.handler.js';
import { UnsuspendCardHandler } from './application/commands/unsuspend-card.handler.js';
import { BulkIntroduceFromVocabularyListHandler } from './application/commands/bulk-introduce-from-vocabulary-list.handler.js';

// Query handlers
import { GetDueCardsHandler } from './application/queries/get-due-cards.handler.js';
import { GetCardByIdHandler } from './application/queries/get-card-by-id.handler.js';
import { GetUserSrsStatsHandler } from './application/queries/get-user-srs-stats.handler.js';

// Presentation
import { SrsController } from './presentation/srs.controller.js';

const CommandHandlers = [
  IntroduceCardHandler,
  ReviewCardHandler,
  SuspendCardHandler,
  UnsuspendCardHandler,
  BulkIntroduceFromVocabularyListHandler,
];

const QueryHandlers = [
  GetDueCardsHandler,
  GetCardByIdHandler,
  GetUserSrsStatsHandler,
];

@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [SrsController],
  providers: [
    { provide: SRS_REPOSITORY, useClass: PrismaSrsRepository },
    { provide: SRS_SCHEDULER, useClass: FsrsScheduler },
    { provide: SRS_LIMITS_POLICY, useClass: RedisSrsLimitsPolicy },
    { provide: CLOCK, useClass: SystemClock },
    RedisDueQueueService,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  // Export command handlers so EventsModule consumers can dispatch SRS commands.
  exports: [
    IntroduceCardHandler,
    ReviewCardHandler,
    BulkIntroduceFromVocabularyListHandler,
  ],
})
export class SrsModule {}
