import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ProbeTask } from '../../../domain/entities/probe-task.entity.js';
import type {
  ProbeExpiredError,
  ProbeNotYoursError,
} from '../../../domain/exceptions/probe.errors.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../../domain/repositories/probe-task.repository.js';
import { GetProbeQuery } from './get-probe.query.js';

/** `null` means no such probe — distinct from expired, which the entity reports. */
export type GetProbeError = ProbeExpiredError | ProbeNotYoursError | null;

@QueryHandler(GetProbeQuery)
export class GetProbeHandler implements IQueryHandler<GetProbeQuery> {
  constructor(@Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository) {}

  async execute(query: GetProbeQuery): Promise<Result<ProbeTask, GetProbeError>> {
    const probe = await this.probes.findById(query.probeId);
    if (!probe) return Result.fail<ProbeTask, GetProbeError>(null);

    return probe.openableBy(query.userId);
  }
}
