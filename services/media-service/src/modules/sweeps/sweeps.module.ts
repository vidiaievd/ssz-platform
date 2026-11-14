import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetsModule } from '../assets/assets.module.js';
import { SweepRunner } from './application/sweep-runner.js';
import { RunSweepHandler } from './application/commands/run-sweep/run-sweep.handler.js';
import { GetSweepsOverviewHandler } from './application/queries/get-sweeps-overview/get-sweeps-overview.handler.js';
import { SWEEP_RUN_REPOSITORY } from './domain/sweep-run.repository.interface.js';
import { PrismaSweepRunRepository } from './infrastructure/prisma-sweep-run.repository.js';
import { AdminSweepsController } from './presentation/controllers/admin-sweeps.controller.js';
import { InternalSweepsController } from './presentation/controllers/internal-sweeps.controller.js';

/**
 * Runs of the media sweeps and their history (plan 90, phase 8). The sweeps themselves stay in
 * the assets module; every run — nightly, operator, admin — starts through `SweepRunner`.
 */
@Module({
  imports: [CqrsModule, AssetsModule],
  controllers: [AdminSweepsController, InternalSweepsController],
  providers: [
    SweepRunner,
    GetSweepsOverviewHandler,
    RunSweepHandler,
    { provide: SWEEP_RUN_REPOSITORY, useClass: PrismaSweepRunRepository },
  ],
  exports: [SweepRunner],
})
export class SweepsModule {}
