import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { REVIEW_BLOCK_REPOSITORY } from './domain/repositories/review-block.repository.interface.js';
import { ReviewBlockPrismaRepository } from './infrastructure/persistence/review-block.prisma.repository.js';
import { SCHOOL_ROLE_READER } from './application/ports/school-role.reader.js';
import { ReviewBlockAccessService } from './application/services/review-block-access.js';
import { CreateReviewBlockHandler } from './application/commands/create-review-block/create-review-block.handler.js';
import { UpdateReviewBlockHandler } from './application/commands/update-review-block/update-review-block.handler.js';
import { DeleteReviewBlockHandler } from './application/commands/delete-review-block/delete-review-block.handler.js';
import { SkipReviewBlockDayHandler } from './application/commands/skip-review-block-day/skip-review-block-day.handler.js';
import { ListTeacherReviewBlocksHandler } from './application/queries/list-teacher-review-blocks/list-teacher-review-blocks.handler.js';
import { ListSchoolReviewBlocksHandler } from './application/queries/list-school-review-blocks/list-school-review-blocks.handler.js';
import { ReviewBlocksController } from './presentation/controllers/review-blocks.controller.js';
import { OrgServiceHttpClient } from '../../infrastructure/org/org-service.http-client.js';

const CommandHandlers = [
  CreateReviewBlockHandler,
  UpdateReviewBlockHandler,
  DeleteReviewBlockHandler,
  SkipReviewBlockDayHandler,
];
const QueryHandlers = [ListTeacherReviewBlocksHandler, ListSchoolReviewBlocksHandler];

@Module({
  imports: [CqrsModule],
  controllers: [ReviewBlocksController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ReviewBlockAccessService,
    OrgServiceHttpClient,
    { provide: SCHOOL_ROLE_READER, useExisting: OrgServiceHttpClient },
    { provide: REVIEW_BLOCK_REPOSITORY, useClass: ReviewBlockPrismaRepository },
  ],
  exports: [REVIEW_BLOCK_REPOSITORY],
})
export class ReviewBlocksModule {}
