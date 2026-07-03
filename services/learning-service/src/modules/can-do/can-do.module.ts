import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { SrsModule } from '../srs/srs.module.js';
import { CAN_DO_PROGRESS_REPOSITORY } from './domain/repositories/can-do-progress.repository.interface.js';
import { PrismaCanDoProgressRepository } from './infrastructure/persistence/prisma-can-do-progress.repository.js';
import { CanDoEvaluatorService } from './application/services/can-do-evaluator.service.js';
import { CanDoProgressController } from './presentation/controllers/can-do-progress.controller.js';

@Module({
  imports: [CqrsModule, PrismaModule, SrsModule],
  controllers: [CanDoProgressController],
  providers: [
    { provide: CAN_DO_PROGRESS_REPOSITORY, useClass: PrismaCanDoProgressRepository },
    CanDoEvaluatorService,
  ],
  exports: [CanDoEvaluatorService, CAN_DO_PROGRESS_REPOSITORY],
})
export class CanDoModule {}
