import { randomUUID } from 'node:crypto';
import {
  Inject,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { ModelCaller } from '../../../../gateway/application/model-caller.js';
import type { CapabilityBinding } from '../../../../registry/application/queries/list-bindings/list-bindings.handler.js';
import { GetBindingQuery } from '../../../../registry/application/queries/get-binding/get-binding.query.js';
import { missingFeatures } from '../../../domain/capability.js';
import { REVIEW_ATTEMPTS_CLIENT, type IReviewAttemptsClient } from '../../application/ports/review-attempts.client.js';
import { unaskable as unaskableSubject } from '../../application/review-input.js';
import { REVIEW_DRAFT_PROMPT_VERSIONS } from '../../prompts/prompts.js';
import { REVIEW_DRAFT } from '../../review-draft.capability.js';
import type { EvalRun } from '../domain/eval-run.js';
import type { ReviewCase } from '../domain/review-case.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from './ports/eval-run.repository.js';
import { ReviewEvalRunner } from './review-eval-runner.js';
import { RunReviewEvalCommand } from './run-review-eval.command.js';

/**
 * Checks everything that can be checked before spending money — the prompt version, the
 * model and what it can do, a non-empty set — then starts the run and answers with it,
 * `running`. The scores land on the run when it finishes.
 *
 * A case the queue would never ask a model about — every check off, every answer blank —
 * is left out of the set here and counted with the engine's own skips.
 */
@CommandHandler(RunReviewEvalCommand)
export class RunReviewEvalHandler implements ICommandHandler<RunReviewEvalCommand, EvalRun> {
  constructor(
    private readonly caller: ModelCaller,
    private readonly runner: ReviewEvalRunner,
    private readonly queryBus: QueryBus,
    @Inject(REVIEW_ATTEMPTS_CLIENT) private readonly attempts: IReviewAttemptsClient,
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository,
  ) {}

  async execute(command: RunReviewEvalCommand): Promise<EvalRun> {
    const { binding }: CapabilityBinding = await this.queryBus.execute(new GetBindingQuery(REVIEW_DRAFT.code));
    const promptVersion = command.promptVersion ?? binding?.promptVersion ?? null;
    if (!promptVersion) throw new UnprocessableEntityException('review_draft is not bound: name a promptVersion');
    if (!REVIEW_DRAFT_PROMPT_VERSIONS.includes(promptVersion)) {
      throw new UnprocessableEntityException(
        `review_draft has no prompt version "${promptVersion}" (known: ${REVIEW_DRAFT_PROMPT_VERSIONS.join(', ')})`,
      );
    }

    const resolved = await this.caller.resolve(command.modelId);
    if (resolved.isFail) {
      if (resolved.error.kind === 'not_found') throw new NotFoundException(`Model ${command.modelId} not found`);
      throw new UnprocessableEntityException({ message: 'The model cannot be called', missing: resolved.error.missing });
    }
    const model = resolved.value;
    const lacking = missingFeatures(model.model.features, REVIEW_DRAFT.requiredFeatures);
    if (lacking.length > 0) {
      throw new UnprocessableEntityException({ message: 'The model lacks what review_draft needs', missing: lacking });
    }

    let set: Awaited<ReturnType<IReviewAttemptsClient['listCases']>>;
    try {
      set = await this.attempts.listCases(command.limit);
    } catch (err) {
      throw new ServiceUnavailableException(
        `The settled drafts could not be read from exercise-engine: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const skipped = { ...set.skipped };
    const cases = set.cases.filter((c) => {
      const reason = unaskable(c);
      if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
      return reason === null;
    });
    if (cases.length === 0) {
      throw new UnprocessableEntityException({ message: 'No settled drafts to measure a model on yet', skipped });
    }

    const run: EvalRun = {
      id: randomUUID(),
      capability: REVIEW_DRAFT.code,
      modelId: model.model.id,
      promptVersion,
      status: 'running',
      startedBy: command.actorUserId,
      bindingAtStart: binding
        ? { primaryModelId: binding.primaryModelId, fallbackModelId: binding.fallbackModelId, promptVersion: binding.promptVersion }
        : null,
      caseCount: cases.length,
      skipped,
      scores: null,
      cases: null,
      cost: null,
      credits: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    await this.runs.create(run);
    void this.runner.start(run, model, cases);
    return run;
  }
}

/**
 * The queue's own filter, by the reason's name in `skipped`. A case is already a drafted one,
 * so `ai_off` means the author switched AI off since — the case is still not asked.
 */
function unaskable(c: ReviewCase): string | null {
  return unaskableSubject(c.subject)?.toUpperCase() ?? null;
}
