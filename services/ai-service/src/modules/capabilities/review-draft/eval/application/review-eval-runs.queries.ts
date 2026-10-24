import { Inject, NotFoundException } from '@nestjs/common';
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { CapabilityBinding } from '../../../../registry/application/queries/list-bindings/list-bindings.handler.js';
import { GetBindingQuery } from '../../../../registry/application/queries/get-binding/get-binding.query.js';
import { REVIEW_DRAFT } from '../../review-draft.capability.js';
import type { BindingAtStart, EvalRun } from '../domain/eval-run.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from './ports/eval-run.repository.js';

export class ListReviewEvalRunsQuery {
  constructor(readonly limit: number) {}
}

export class GetReviewEvalRunQuery {
  constructor(readonly runId: string) {}
}

/** Where a run stands against today's binding: its primary, its fallback, or neither. */
export type BindingMatch = 'primary' | 'fallback' | null;

export type EvalRunSummary = Omit<EvalRun, 'cases'> & { matchesBinding: BindingMatch };

export interface ReviewEvalRuns {
  /** Today's binding; null when review_draft is not bound. */
  binding: BindingAtStart | null;
  runs: EvalRunSummary[];
}

/**
 * The comparison table (plan 79, step 1.6): every run's scores side by side, newest first,
 * each marked against today's binding — the run of the bound model and prompt version is
 * the row the others are read against.
 */
@QueryHandler(ListReviewEvalRunsQuery)
export class ListReviewEvalRunsHandler implements IQueryHandler<ListReviewEvalRunsQuery, ReviewEvalRuns> {
  constructor(
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListReviewEvalRunsQuery): Promise<ReviewEvalRuns> {
    const binding = await currentBinding(this.queryBus);
    const runs = await this.runs.list(REVIEW_DRAFT.code, query.limit);
    return {
      binding,
      runs: runs.map(({ cases: _cases, ...run }) => ({ ...run, matchesBinding: bindingMatch(run, binding) })),
    };
  }
}

/** One run with its cases — which submission scored how, without any text. */
@QueryHandler(GetReviewEvalRunQuery)
export class GetReviewEvalRunHandler implements IQueryHandler<GetReviewEvalRunQuery, EvalRun & { matchesBinding: BindingMatch }> {
  constructor(
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetReviewEvalRunQuery): Promise<EvalRun & { matchesBinding: BindingMatch }> {
    const run = await this.runs.findById(query.runId);
    if (!run || run.capability !== REVIEW_DRAFT.code) throw new NotFoundException(`Eval run ${query.runId} not found`);
    return { ...run, matchesBinding: bindingMatch(run, await currentBinding(this.queryBus)) };
  }
}

async function currentBinding(queryBus: QueryBus): Promise<BindingAtStart | null> {
  const { binding }: CapabilityBinding = await queryBus.execute(new GetBindingQuery(REVIEW_DRAFT.code));
  return binding
    ? { primaryModelId: binding.primaryModelId, fallbackModelId: binding.fallbackModelId, promptVersion: binding.promptVersion }
    : null;
}

export function bindingMatch(run: Pick<EvalRun, 'modelId' | 'promptVersion'>, binding: BindingAtStart | null): BindingMatch {
  if (!binding || run.promptVersion !== binding.promptVersion) return null;
  if (run.modelId === binding.primaryModelId) return 'primary';
  return run.modelId === binding.fallbackModelId ? 'fallback' : null;
}
