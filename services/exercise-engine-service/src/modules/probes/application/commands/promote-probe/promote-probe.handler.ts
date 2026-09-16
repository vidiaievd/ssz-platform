import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import {
  ProbeAlreadyPromotedError,
  ProbeNotYoursError,
} from '../../../domain/exceptions/probe.errors.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../../domain/repositories/probe-task.repository.js';
import { PromoteProbeCommand } from './promote-probe.command.js';

export type PromoteProbeError =
  | ProbeAlreadyPromotedError
  | ProbeNotYoursError
  | ContentClientError
  /** No such probe — it never existed, or it has already been swept. */
  | null;

export interface PromoteProbeResult {
  exerciseId: string;
}

@CommandHandler(PromoteProbeCommand)
export class PromoteProbeHandler implements ICommandHandler<PromoteProbeCommand> {
  private readonly logger = new Logger(PromoteProbeHandler.name);

  constructor(
    @Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository,
    @Inject(CONTENT_CLIENT) private readonly content: IContentClient,
  ) {}

  async execute(
    command: PromoteProbeCommand,
  ): Promise<Result<PromoteProbeResult, PromoteProbeError>> {
    const probe = await this.probes.findById(command.probeId);
    if (!probe) return Result.fail<PromoteProbeResult, PromoteProbeError>(null);

    /*
      The learner it was dealt to, or whoever made it.

      Both, because both are people with something to say about whether the question was
      any good: a tutor who assembled it and watched it land, and a learner who met it and
      wants to keep it. What neither of them is doing here is writing into anybody else's
      catalogue — the exercise comes out owned by whoever asked, and private.
    */
    const mayPromote = probe.userId === command.userId || probe.createdByUserId === command.userId;
    if (!mayPromote) {
      return Result.fail<PromoteProbeResult, PromoteProbeError>(new ProbeNotYoursError());
    }

    /*
      Asked and answered before anything is created, not after.

      The domain refuses a second promotion, but a refusal that arrives *after* the call
      to Content Service would have filed the second exercise first — which is precisely
      the duplicate the rule exists to prevent. The check below is the one that protects
      the catalogue; `promote()` further down is the backstop that keeps the rule true
      for any future caller.
    */
    if (probe.promotedExerciseId !== null) {
      return Result.fail<PromoteProbeResult, PromoteProbeError>(
        new ProbeAlreadyPromotedError(probe.promotedExerciseId),
      );
    }

    /*
      Expiry is not checked, and that is the point of the gesture.

      A probe's time limit is about *answering* it: a question chosen for the state of
      someone's memory this afternoon says nothing useful tomorrow. Whether the question
      was well made has nothing to do with the clock, and a teacher looking through
      yesterday's tasks is exactly who this is for. Once the sweep has taken the row the
      answer is no, but that is the row being gone, not a rule.
    */

    const created = await this.content.createExercise({
      ownerUserId: command.userId,
      templateCode: probe.definition.templateCode,
      targetLanguage: probe.definition.targetLanguage,
      difficultyLevel: probe.definition.difficultyLevel,
      content: probe.definition.content,
      expectedAnswers: probe.definition.expectedAnswers,
      answerCheckSettings: probe.definition.answerCheckSettings,
      // The addresses travel with it, and they are the reason to promote rather than
      // retype: the exercise arrives already saying what it is about, which is the state
      // most of the catalogue is still not in.
      targets: probe.targets,
    });
    if (created.isFail) {
      this.logger.warn(`Promoting probe ${probe.id} failed: ${created.error.message}`);
      return Result.fail<PromoteProbeResult, PromoteProbeError>(created.error);
    }

    const promoted = probe.promote(created.value.exerciseId);
    if (promoted.isFail) {
      // Unreachable through this handler — the check above already answered it — and left
      // in rather than asserted away: it is the domain's rule, and a caller that one day
      // races another to the same probe should lose here rather than silently.
      return Result.fail<PromoteProbeResult, PromoteProbeError>(promoted.error);
    }

    await this.probes.save(probe);

    return Result.ok<PromoteProbeResult, PromoteProbeError>({
      exerciseId: created.value.exerciseId,
    });
  }
}
