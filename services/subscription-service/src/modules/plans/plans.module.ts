import { Module } from '@nestjs/common';
import { ArchivePlanHandler } from './application/commands/archive-plan/archive-plan.handler.js';
import { CreatePlanHandler } from './application/commands/create-plan/create-plan.handler.js';
import { RenamePlanHandler } from './application/commands/rename-plan/rename-plan.handler.js';
import { RevisePlanHandler } from './application/commands/revise-plan/revise-plan.handler.js';
import { PLAN_REPOSITORY } from './application/ports/plan.repository.js';
import { GetPlanHandler } from './application/queries/get-plan/get-plan.handler.js';
import { ListPlansHandler } from './application/queries/list-plans/list-plans.handler.js';
import { PrismaPlanRepository } from './infrastructure/persistence/prisma-plan.repository.js';
import { AdminPlansController } from './presentation/controllers/admin-plans.controller.js';

@Module({
  controllers: [AdminPlansController],
  providers: [
    CreatePlanHandler,
    RenamePlanHandler,
    RevisePlanHandler,
    ArchivePlanHandler,
    ListPlansHandler,
    GetPlanHandler,
    { provide: PLAN_REPOSITORY, useClass: PrismaPlanRepository },
  ],
  exports: [PLAN_REPOSITORY],
})
export class PlansModule {}
