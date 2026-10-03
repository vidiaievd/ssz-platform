import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../../config/configuration.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ANSWER_VALIDATOR,
  type IAnswerValidator,
} from '../../../../../shared/application/ports/answer-validator.port.js';
import { ProbeTask } from '../../../domain/entities/probe-task.entity.js';
import { ProbeTemplateNotScorableError } from '../../../domain/exceptions/probe.errors.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../../domain/repositories/probe-task.repository.js';
import { CreateProbeCommand } from './create-probe.command.js';
import { ProbeSweeper } from '../../services/probe-sweeper.service.js';

export type CreateProbeError = ProbeTemplateNotScorableError;

@CommandHandler(CreateProbeCommand)
export class CreateProbeHandler implements ICommandHandler<CreateProbeCommand> {
  private readonly logger = new Logger(CreateProbeHandler.name);
  private readonly defaultTtlSeconds: number;
  private readonly maxTtlSeconds: number;

  constructor(
    @Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository,
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    private readonly sweeper: ProbeSweeper,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['probes']>('probes')!;
    this.defaultTtlSeconds = cfg.defaultTtlSeconds;
    this.maxTtlSeconds = cfg.maxTtlSeconds;
  }

  async execute(command: CreateProbeCommand): Promise<Result<ProbeTask, CreateProbeError>> {
    /*
      Refused here rather than when the answer arrives.

      A probe exists to produce one piece of evidence about one atom. Built on a template
      the engine has no validator for, it produces none — the learner works through it and
      the submission comes back as an error — so the failure belongs to whoever assembled
      it, at the moment they assembled it, and not to the person who was asked to answer.
    */
    if (!this.validator.supports(command.definition.templateCode)) {
      return Result.fail<ProbeTask, CreateProbeError>(
        new ProbeTemplateNotScorableError(command.definition.templateCode),
      );
    }

    const probe = ProbeTask.create({
      userId: command.userId,
      subject: command.subject,
      requiredModality: command.requiredModality,
      definition: command.definition,
      skills: command.skills,
      focus: command.focus,
      targets: command.targets ?? undefined,
      source: command.source,
      createdByUserId: command.createdByUserId,
      ttlSeconds: Math.min(command.ttlSeconds ?? this.defaultTtlSeconds, this.maxTtlSeconds),
    });

    await this.probes.save(probe);

    /*
      The sweep rides on creation, and this service runs no scheduler.

      Nothing here is worth a cron dependency and a second thing to keep running: probes
      are made in the same breath as they are answered, so the table's only busy periods
      are exactly when this line runs. A quiet platform leaves a handful of expired rows
      sitting until the next probe is made, which costs nothing — they are refused on read
      long before anyone could meet one.

      Failure is logged and swallowed. The caller asked for a task and got one; a sweep
      that could not run is this service's business, not theirs.
    */
    void this.sweeper.sweep().catch((err: unknown) => {
      this.logger.warn(
        `Probe sweep after create failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return Result.ok<ProbeTask, CreateProbeError>(probe);
  }
}
