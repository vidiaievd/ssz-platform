import { Module } from '@nestjs/common';
import { REVIEW_BLOCK_REPOSITORY } from './domain/repositories/review-block.repository.interface.js';
import { ReviewBlockPrismaRepository } from './infrastructure/persistence/review-block.prisma.repository.js';

@Module({
  providers: [{ provide: REVIEW_BLOCK_REPOSITORY, useClass: ReviewBlockPrismaRepository }],
  exports: [REVIEW_BLOCK_REPOSITORY],
})
export class ReviewBlocksModule {}
