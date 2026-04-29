import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { PROGRESS_REPOSITORY } from './domain/repositories/progress.repository.interface.js';
import { CLOCK, SystemClock } from '../../shared/application/ports/clock.port.js';
import { PrismaProgressRepository } from './infrastructure/persistence/prisma-progress.repository.js';
import { UpsertProgressHandler } from './application/commands/upsert-progress.handler.js';
import { MarkNeedsReviewHandler } from './application/commands/mark-needs-review.handler.js';
import { ResolveReviewHandler } from './application/commands/resolve-review.handler.js';
import { GetUserProgressHandler } from './application/queries/get-user-progress.handler.js';
import { GetContentProgressHandler } from './application/queries/get-content-progress.handler.js';
import { GetAssignmentProgressHandler } from './application/queries/get-assignment-progress.handler.js';
import { ProgressController } from './presentation/progress.controller.js';
import { ContainerCompletionService } from './application/services/container-completion.service.js';

const CommandHandlers = [
  UpsertProgressHandler,
  MarkNeedsReviewHandler,
  ResolveReviewHandler,
];

const QueryHandlers = [
  GetUserProgressHandler,
  GetContentProgressHandler,
  GetAssignmentProgressHandler,
];

@Module({
  imports: [CqrsModule, PrismaModule, AssignmentsModule],
  controllers: [ProgressController],
  providers: [
    { provide: PROGRESS_REPOSITORY, useClass: PrismaProgressRepository },
    { provide: CLOCK, useClass: SystemClock },
    ContainerCompletionService,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [ContainerCompletionService],
})
export class ProgressModule {}
