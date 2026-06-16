import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PLACEMENT_RESULT_REPOSITORY } from './domain/repositories/placement-result.repository.interface.js';
import { PlacementResultPrismaRepository } from './infrastructure/persistence/placement-result.prisma.repository.js';
import { RecordPlacementHandler } from './application/commands/record-placement/record-placement.handler.js';
import { GetMyPlacementsHandler } from './application/queries/get-my-placements/get-my-placements.handler.js';
import { GetMyPlacementByLangHandler } from './application/queries/get-my-placement-by-lang/get-my-placement-by-lang.handler.js';
import { PlacementController } from './presentation/controllers/placement.controller.js';

@Module({
  imports: [CqrsModule],
  controllers: [PlacementController],
  providers: [
    RecordPlacementHandler,
    GetMyPlacementsHandler,
    GetMyPlacementByLangHandler,
    {
      provide: PLACEMENT_RESULT_REPOSITORY,
      useClass: PlacementResultPrismaRepository,
    },
  ],
})
export class PlacementModule {}
