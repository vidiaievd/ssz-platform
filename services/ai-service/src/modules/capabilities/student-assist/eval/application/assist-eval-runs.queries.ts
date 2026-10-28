import { Inject, NotFoundException } from '@nestjs/common';
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { CapabilityBinding } from '../../../../registry/application/queries/list-bindings/list-bindings.handler.js';
import { GetBindingQuery } from '../../../../registry/application/queries/get-binding/get-binding.query.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from '../../../review-draft/eval/application/ports/eval-run.repository.js';
import { bindingMatch, type BindingMatch } from '../../../review-draft/eval/application/review-eval-runs.queries.js';
import type { BindingAtStart } from '../../../review-draft/eval/domain/eval-run.js';
import { STUDENT_ASSIST } from '../../student-assist.capability.js';
import type { AssistCaseResult, AssistRunScores } from '../domain/assist-eval-score.js';
import type { AssistEvalRun } from './assist-eval-runner.js';

export class ListAssistEvalRunsQuery {
  constructor(readonly limit: number) {}
}

export class GetAssistEvalRunQuery {
  constructor(readonly runId: string) {}
}

export type AssistEvalRunSummary = Omit<AssistEvalRun, 'cases'> & { matchesBinding: BindingMatch };

export interface AssistEvalRuns {
  /** Today's binding; null when student_assist is not bound. */
  binding: BindingAtStart | null;
  runs: AssistEvalRunSummary[];
}

/**
 * The comparison table (plan 83, step 8): every run's scores side by side, newest first, each
 * marked against today's binding — model and prompt version, as for review drafts.
 */
@QueryHandler(ListAssistEvalRunsQuery)
export class ListAssistEvalRunsHandler implements IQueryHandler<ListAssistEvalRunsQuery, AssistEvalRuns> {
  constructor(
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<AssistRunScores, AssistCaseResult>,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListAssistEvalRunsQuery): Promise<AssistEvalRuns> {
    const binding = await currentBinding(this.queryBus);
    const runs = await this.runs.list(STUDENT_ASSIST.code, query.limit);
    return {
      binding,
      runs: runs.map(({ cases: _cases, ...run }) => ({ ...run, matchesBinding: bindingMatch(run, binding) })),
    };
  }
}

/** One run with its cases — which question went how, by the case's key, without any text. */
@QueryHandler(GetAssistEvalRunQuery)
export class GetAssistEvalRunHandler
  implements IQueryHandler<GetAssistEvalRunQuery, AssistEvalRun & { matchesBinding: BindingMatch }>
{
  constructor(
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<AssistRunScores, AssistCaseResult>,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetAssistEvalRunQuery): Promise<AssistEvalRun & { matchesBinding: BindingMatch }> {
    const run = await this.runs.findById(query.runId);
    if (!run || run.capability !== STUDENT_ASSIST.code) throw new NotFoundException(`Eval run ${query.runId} not found`);
    return { ...run, matchesBinding: bindingMatch(run, await currentBinding(this.queryBus)) };
  }
}

async function currentBinding(queryBus: QueryBus): Promise<BindingAtStart | null> {
  const { binding }: CapabilityBinding = await queryBus.execute(new GetBindingQuery(STUDENT_ASSIST.code));
  return binding
    ? { primaryModelId: binding.primaryModelId, fallbackModelId: binding.fallbackModelId, promptVersion: binding.promptVersion }
    : null;
}
