import { Inject, NotFoundException } from '@nestjs/common';
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { CapabilityBinding } from '../../../../registry/application/queries/list-bindings/list-bindings.handler.js';
import { GetBindingQuery } from '../../../../registry/application/queries/get-binding/get-binding.query.js';
import type { BindingMatch } from '../../../review-draft/eval/application/review-eval-runs.queries.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from '../../../review-draft/eval/application/ports/eval-run.repository.js';
import type { BindingAtStart } from '../../../review-draft/eval/domain/eval-run.js';
import { VOICE_REVIEW, VOICE_REVIEW_PRONUNCIATION } from '../../voice-review.capability.js';
import type { ReadingCaseResult, ReadingRunScores } from '../domain/reading-score.js';
import type { ReadingEvalRun } from './voice-eval-runner.js';

const VOICE_CAPABILITIES = [VOICE_REVIEW.code, VOICE_REVIEW_PRONUNCIATION.code];

export class ListVoiceEvalRunsQuery {
  constructor(readonly limit: number) {}
}

export class GetVoiceEvalRunQuery {
  constructor(readonly runId: string) {}
}

export type VoiceEvalRunSummary = Omit<ReadingEvalRun, 'cases'> & { matchesBinding: BindingMatch };

export interface VoiceEvalRuns {
  /** Today's binding of each voice capability; null when it is not bound. */
  bindings: Record<string, BindingAtStart | null>;
  runs: VoiceEvalRunSummary[];
}

/**
 * The comparison table for gate Q5 (plan 82, step 10): runs of both voice capabilities, newest
 * first, each marked against its capability's binding today. A speech model has no prompt, so
 * the model alone says which run is the bound one.
 */
@QueryHandler(ListVoiceEvalRunsQuery)
export class ListVoiceEvalRunsHandler implements IQueryHandler<ListVoiceEvalRunsQuery, VoiceEvalRuns> {
  constructor(
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<ReadingRunScores, ReadingCaseResult>,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListVoiceEvalRunsQuery): Promise<VoiceEvalRuns> {
    const bindings = await currentBindings(this.queryBus);
    const lists = await Promise.all(VOICE_CAPABILITIES.map((code) => this.runs.list(code, query.limit)));
    const runs = lists
      .flat()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, query.limit);
    return {
      bindings,
      runs: runs.map(({ cases: _cases, ...run }) => ({ ...run, matchesBinding: voiceBindingMatch(run, bindings[run.capability] ?? null) })),
    };
  }
}

/** One run with its readings — which prompt the machine and the teacher ruled how, without any text. */
@QueryHandler(GetVoiceEvalRunQuery)
export class GetVoiceEvalRunHandler
  implements IQueryHandler<GetVoiceEvalRunQuery, ReadingEvalRun & { matchesBinding: BindingMatch }>
{
  constructor(
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<ReadingRunScores, ReadingCaseResult>,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetVoiceEvalRunQuery): Promise<ReadingEvalRun & { matchesBinding: BindingMatch }> {
    const run = await this.runs.findById(query.runId);
    if (!run || !VOICE_CAPABILITIES.includes(run.capability)) throw new NotFoundException(`Eval run ${query.runId} not found`);
    const bindings = await currentBindings(this.queryBus);
    return { ...run, matchesBinding: voiceBindingMatch(run, bindings[run.capability] ?? null) };
  }
}

async function currentBindings(queryBus: QueryBus): Promise<Record<string, BindingAtStart | null>> {
  const entries = await Promise.all(
    VOICE_CAPABILITIES.map(async (code) => {
      const { binding }: CapabilityBinding = await queryBus.execute(new GetBindingQuery(code));
      const ref: BindingAtStart | null = binding
        ? { primaryModelId: binding.primaryModelId, fallbackModelId: binding.fallbackModelId, promptVersion: binding.promptVersion }
        : null;
      return [code, ref] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function voiceBindingMatch(run: Pick<ReadingEvalRun, 'modelId'>, binding: BindingAtStart | null): BindingMatch {
  if (!binding) return null;
  if (run.modelId === binding.primaryModelId) return 'primary';
  return run.modelId === binding.fallbackModelId ? 'fallback' : null;
}
