import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common';
import { ModelCaller } from '../../../../gateway/application/model-caller.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import type { ModelForCall } from '../../../../registry/application/ports/registry.reader.js';
import { PLATFORM_PAYER } from '../../../../access/domain/payer.js';
import { toReviewSubject } from '../../application/review-input.js';
import { toReviewDraft } from '../../domain/review-remarks.js';
import { reviewRequest } from '../../prompts/prompts.js';
import { REVIEW_DRAFT } from '../../review-draft.capability.js';
import { totalCost, type EvalRun } from '../domain/eval-run.js';
import { scoreCase, summarize, type CaseResult } from '../domain/eval-score.js';
import type { ReviewCase } from '../domain/review-case.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from './ports/eval-run.repository.js';

/** The ledger's surface for a candidate's calls over the set. */
export const ADMIN_EVAL_SURFACE = 'admin_eval';

/** Calls in flight at once: enough to finish a set in minutes, few enough not to trip a provider's rate limit. */
export const EVAL_CONCURRENCY = Symbol('EVAL_CONCURRENCY');
const DEFAULT_CONCURRENCY = 3;

/**
 * Runs a candidate over the set in the background (plan 79, step 1.6): every case is asked
 * of the candidate as the teacher's queue would ask it — the same input, the candidate's
 * prompt version, the binding's call parameters — and its remarks are scored against what
 * the teacher kept and threw out. The run row is written once, at the end.
 *
 * A run lives in this process. One the process did not live to finish is failed when the
 * service next starts, rather than left `running` for ever.
 */
@Injectable()
export class ReviewEvalRunner implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReviewEvalRunner.name);

  constructor(
    private readonly caller: ModelCaller,
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository,
    @Optional() @Inject(EVAL_CONCURRENCY) private readonly concurrency: number = DEFAULT_CONCURRENCY,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const failed = await this.runs.failRunning('interrupted: the service restarted during the run', new Date());
    if (failed > 0) this.logger.warn(`${failed} eval run(s) left running by a previous process marked failed`);
  }

  /** Starts the run and returns at once; the promise is for tests, callers do not wait on it. */
  start(run: EvalRun, model: ModelForCall, cases: ReviewCase[]): Promise<void> {
    return this.execute(run, model, cases).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Eval run ${run.id} failed: ${message}`);
      await this.runs.finish(run.id, { status: 'failed', error: message }, new Date()).catch(() => undefined);
    });
  }

  private async execute(run: EvalRun, model: ModelForCall, cases: ReviewCase[]): Promise<void> {
    const context: CallContext = {
      payer: PLATFORM_PAYER,
      actor: { userId: run.startedBy, role: 'platform_admin' },
      surface: ADMIN_EVAL_SURFACE,
    };
    const results: CaseResult[] = new Array(cases.length);
    const ledger: Array<{ cost: { micros: number; currency: string } | null; credits: string | null }> = [];

    let next = 0;
    const worker = async () => {
      while (next < cases.length) {
        const index = next++;
        const { result, recorded } = await this.runCase(cases[index]!, run.promptVersion, model, context);
        results[index] = result;
        ledger.push(recorded);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, cases.length) }, worker));

    const { cost, credits } = totalCost(ledger);
    await this.runs.finish(run.id, { status: 'done', scores: summarize(results), cases: results, cost, credits }, new Date());
    this.logger.log(`Eval run ${run.id} done: ${cases.length} case(s) on ${run.modelId} / ${run.promptVersion}`);
  }

  private async runCase(evalCase: ReviewCase, promptVersion: string, model: ModelForCall, context: CallContext) {
    // The school's language is not asked for: the set carries no school.
    const subject = toReviewSubject(evalCase.subject, null);
    const call = await this.caller.call(
      REVIEW_DRAFT.code,
      context,
      model,
      promptVersion,
      reviewRequest(promptVersion, subject),
    );
    const { outcome, recorded, latencyMs } = call;

    const base = { caseId: evalCase.caseId, latencyMs };
    if (outcome.kind === 'error') {
      const failed: CaseResult = {
        ...base,
        outcome: outcome.error.code === 'invalid_response' ? 'invalid_response' : 'error',
        errorCode: outcome.error.code,
        score: null,
      };
      return { result: failed, recorded };
    }
    if (outcome.result.output.kind !== 'structured') {
      return { result: { ...base, outcome: 'invalid_response', errorCode: 'invalid_response', score: null } as CaseResult, recorded };
    }
    const draft = toReviewDraft(outcome.result.output.data, subject.input);
    const score = scoreCase(evalCase, draft.items, draft.marks);
    return { result: { ...base, outcome: 'ok', errorCode: null, score } as CaseResult, recorded };
  }
}
