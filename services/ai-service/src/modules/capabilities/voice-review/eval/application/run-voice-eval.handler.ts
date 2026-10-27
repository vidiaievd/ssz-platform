import { randomUUID } from 'node:crypto';
import { Inject, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { ModelCaller } from '../../../../gateway/application/model-caller.js';
import type { CapabilityBinding } from '../../../../registry/application/queries/list-bindings/list-bindings.handler.js';
import { GetBindingQuery } from '../../../../registry/application/queries/get-binding/get-binding.query.js';
import { capabilityGaps } from '../../../domain/capability.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from '../../../review-draft/eval/application/ports/eval-run.repository.js';
import { VOICE_REVIEW, VOICE_REVIEW_PRONUNCIATION } from '../../voice-review.capability.js';
import type { ReadingCaseSet } from '../domain/reading-case.js';
import type { ReadingCaseResult, ReadingRunScores } from '../domain/reading-score.js';
import { READING_CASES_CLIENT, type IReadingCasesClient } from './ports/reading-cases.client.js';
import { RunVoiceEvalCommand } from './run-voice-eval.command.js';
import { VoiceEvalRunner, type ReadingEvalRun } from './voice-eval-runner.js';

/** A speech capability has no prompt: the run carries the binding's label, this when unbound. */
export const NO_PROMPT_VERSION = '-';

/**
 * Checks everything that can be checked before spending money — the model is a speech model
 * the capability can bind, it scores pronunciation when asked to, the set is not empty — then
 * starts the run and answers with it, `running`. Readings in a language the model does not
 * hear are left out here and counted with the engine's own skips.
 */
@CommandHandler(RunVoiceEvalCommand)
export class RunVoiceEvalHandler implements ICommandHandler<RunVoiceEvalCommand, ReadingEvalRun> {
  constructor(
    private readonly caller: ModelCaller,
    private readonly runner: VoiceEvalRunner,
    private readonly queryBus: QueryBus,
    @Inject(READING_CASES_CLIENT) private readonly readings: IReadingCasesClient,
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<ReadingRunScores, ReadingCaseResult>,
  ) {}

  async execute(command: RunVoiceEvalCommand): Promise<ReadingEvalRun> {
    const capability = command.pronunciation ? VOICE_REVIEW_PRONUNCIATION : VOICE_REVIEW;

    const resolved = await this.caller.resolve(command.modelId, 'speech');
    if (resolved.isFail) {
      if (resolved.error.kind === 'not_found') throw new NotFoundException(`Model ${command.modelId} not found`);
      throw new UnprocessableEntityException({ message: 'The model cannot be called', missing: resolved.error.missing });
    }
    const model = resolved.value;
    const lacking = capabilityGaps(model.model, capability);
    if (command.pronunciation && model.model.modality === 'speech' && !model.model.features.pronunciation) {
      lacking.push('pronunciation');
    }
    if (lacking.length > 0) {
      throw new UnprocessableEntityException({ message: `The model lacks what ${capability.code} needs`, missing: lacking });
    }
    const languages = model.model.modality === 'speech' ? model.model.features.languages : [];

    let set: ReadingCaseSet;
    try {
      set = await this.readings.listCases(command.limit);
    } catch (err) {
      throw new ServiceUnavailableException(
        `The decided readings could not be read from exercise-engine: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const skipped = { ...set.skipped };
    const cases = set.cases.filter((c) => {
      if (languages.includes(c.targetLanguage)) return true;
      skipped.LANGUAGE_NOT_SUPPORTED = (skipped.LANGUAGE_NOT_SUPPORTED ?? 0) + 1;
      return false;
    });
    if (cases.length === 0) {
      throw new UnprocessableEntityException({ message: 'No decided readings to measure the model on yet', skipped });
    }

    const { binding }: CapabilityBinding = await this.queryBus.execute(new GetBindingQuery(capability.code));
    const run: ReadingEvalRun = {
      id: randomUUID(),
      capability: capability.code,
      modelId: model.model.id,
      promptVersion: binding?.promptVersion ?? NO_PROMPT_VERSION,
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
    void this.runner.start(run, model, cases, { capability: capability.code, pronunciation: command.pronunciation });
    return run;
  }
}
