import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PROBE_TASK_REPOSITORY } from './domain/repositories/probe-task.repository.js';
import { PrismaProbeTaskRepository } from './infrastructure/persistence/prisma-probe-task.repository.js';
import { CreateProbeHandler } from './application/commands/create-probe/create-probe.handler.js';
import { DiscardProbeHandler } from './application/commands/discard-probe/discard-probe.handler.js';
import { PromoteProbeHandler } from './application/commands/promote-probe/promote-probe.handler.js';
import { GetProbeHandler } from './application/queries/get-probe/get-probe.handler.js';
import { ListMyProbesHandler } from './application/queries/list-my-probes/list-my-probes.handler.js';
import { ProbeSweeper } from './application/services/probe-sweeper.service.js';
import { ProbesController } from './presentation/controllers/probes.controller.js';
import { InternalProbesController } from './presentation/controllers/internal-probes.controller.js';

/**
 * Disposable tasks — plan 63 phase 9.
 *
 * The repository is exported because the next thing built on it lives in the attempts
 * module: starting an attempt has to be able to find a definition here as well as in
 * Content Service, and that resolution is the whole reason a probe is worth storing in
 * the engine rather than anywhere else.
 */
@Module({
  imports: [CqrsModule],
  controllers: [ProbesController, InternalProbesController],
  providers: [
    PrismaProbeTaskRepository,
    { provide: PROBE_TASK_REPOSITORY, useExisting: PrismaProbeTaskRepository },
    ProbeSweeper,
    CreateProbeHandler,
    DiscardProbeHandler,
    PromoteProbeHandler,
    GetProbeHandler,
    ListMyProbesHandler,
  ],
  exports: [PROBE_TASK_REPOSITORY],
})
export class ProbesModule {}
