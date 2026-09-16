import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import { ProbeNotYoursError } from '../../../domain/exceptions/probe.errors.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../../domain/repositories/probe-task.repository.js';
import { DiscardProbeCommand } from './discard-probe.command.js';

/** `null` means no such probe. */
export type DiscardProbeError = ProbeNotYoursError | null;

@CommandHandler(DiscardProbeCommand)
export class DiscardProbeHandler implements ICommandHandler<DiscardProbeCommand> {
  constructor(@Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository) {}

  async execute(command: DiscardProbeCommand): Promise<Result<void, DiscardProbeError>> {
    const probe = await this.probes.findById(command.probeId);
    if (!probe) return Result.fail<void, DiscardProbeError>(null);
    if (probe.userId !== command.userId) {
      return Result.fail<void, DiscardProbeError>(new ProbeNotYoursError());
    }

    // An already-expired probe is discarded without complaint. The caller wanted it gone
    // and it is gone; answering 410 to "delete this" would be pedantry about an outcome
    // both sides agree on.
    await this.probes.delete(probe.id);
    return Result.ok<void, DiscardProbeError>();
  }
}
