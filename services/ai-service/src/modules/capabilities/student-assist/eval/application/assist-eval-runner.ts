import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ModelCaller } from '../../../../gateway/application/model-caller.js';
import type { RecordedCall } from '../../../../ledger/application/call-recorder.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import type { ModelForCall } from '../../../../registry/application/ports/registry.reader.js';
import { PLATFORM_PAYER } from '../../../../access/domain/payer.js';
import { ADMIN_EVAL_SURFACE } from '../../../review-draft/eval/application/review-eval-runner.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from '../../../review-draft/eval/application/ports/eval-run.repository.js';
import { languageName } from '../../../review-draft/domain/comment-language.js';
import { totalCost, type EvalRun } from '../../../review-draft/eval/domain/eval-run.js';
import { runAssistLoop, UNKNOWN_TARGET, type AssistRoundCaller } from '../../application/assist-loop.js';
import { AssistToolbox } from '../../application/assist-toolbox.js';
import { STUDENT_ASSIST } from '../../student-assist.capability.js';
import type { AssistEvalCase } from '../domain/assist-eval-set.js';
import { scoreAssistCase, summarizeAssist, type AssistCaseResult, type AssistRunScores } from '../domain/assist-eval-score.js';

export type AssistEvalRun = EvalRun<AssistRunScores, AssistCaseResult>;

/** A case ready to ask: the course's language read before the run, null for a free question. */
export interface PreparedAssistCase {
  case: AssistEvalCase;
  targetLanguage: string | null;
}

/**
 * Who asks in the eval: nobody. Personal reads — saved words, the mastery profile — come back
 * empty for this id, so a case is answered from the course's material alone, the same on every run.
 */
export const EVAL_LEARNER = '00000000-0000-0000-0000-000000000000';

export const ASSIST_EVAL_CONCURRENCY = Symbol('ASSIST_EVAL_CONCURRENCY');
const DEFAULT_CONCURRENCY = 3;

/**
 * Runs a candidate over the hand-written set in the background (plan 83, step 8): every case
 * is a learner's turn as the phone would send it, put through the assistant's own loop — the
 * candidate's prompt version, the real tools over the seeded course, the verifier, the repair
 * round, the tool budget — with `ModelCaller` in place of the gateway: no gate, no fallback,
 * no breaker, the platform pays, surface `admin_eval`.
 *
 * Answers are scored as they come and dropped; the run row holds counts only (R-j). A run
 * left `running` by a gone process is failed on start-up by the drafts' runner — the table is
 * shared.
 */
@Injectable()
export class AssistEvalRunner {
  private readonly logger = new Logger(AssistEvalRunner.name);

  constructor(
    private readonly caller: ModelCaller,
    private readonly toolbox: AssistToolbox,
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<AssistRunScores, AssistCaseResult>,
    @Optional() @Inject(ASSIST_EVAL_CONCURRENCY) private readonly concurrency: number = DEFAULT_CONCURRENCY,
  ) {}

  /** Starts the run and returns at once; the promise is for tests, callers do not wait on it. */
  start(run: AssistEvalRun, model: ModelForCall, set: string, cases: PreparedAssistCase[]): Promise<void> {
    return this.execute(run, model, set, cases).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Assistant eval run ${run.id} failed: ${message}`);
      await this.runs.finish(run.id, { status: 'failed', error: message }, new Date()).catch(() => undefined);
    });
  }

  private async execute(run: AssistEvalRun, model: ModelForCall, set: string, cases: PreparedAssistCase[]): Promise<void> {
    const context: CallContext = {
      payer: PLATFORM_PAYER,
      actor: { userId: run.startedBy, role: 'platform_admin' },
      surface: ADMIN_EVAL_SURFACE,
    };
    const results: AssistCaseResult[] = new Array(cases.length);
    const ledger: RecordedCall[] = [];

    let next = 0;
    const worker = async () => {
      while (next < cases.length) {
        const index = next++;
        results[index] = await this.runCase(cases[index]!, run.promptVersion, model, context, ledger);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, cases.length) }, worker));

    const { cost, credits } = totalCost(ledger);
    const scores = summarizeAssist(set, results);
    await this.runs.finish(run.id, { status: 'done', scores, cases: results, cost, credits }, new Date());
    this.logger.log(
      `Assistant eval run ${run.id} done: ${scores.answered}/${scores.cases} answered on ${run.modelId} / ${run.promptVersion}, ` +
        `citations ${scores.citationRate ?? '—'}, leaks ${scores.keySeeking.leaked}, rejected ${scores.casesRejected}`,
    );
  }

  private async runCase(
    { case: evalCase, targetLanguage }: PreparedAssistCase,
    promptVersion: string,
    model: ModelForCall,
    context: CallContext,
    ledger: RecordedCall[],
  ): Promise<AssistCaseResult> {
    let latencyMs = 0;
    const round: AssistRoundCaller = async (build) => {
      const call = await this.caller.call(STUDENT_ASSIST.code, context, model, promptVersion, build(promptVersion));
      ledger.push(call.recorded);
      latencyMs += call.latencyMs;
      const { outcome, recorded } = call;
      if (outcome.kind === 'ok') return { kind: 'output', callId: recorded.callId, output: outcome.result.output };
      if (outcome.error.code === 'invalid_response') {
        return { kind: 'invalid', callId: recorded.callId, output: outcome.raw?.output ?? null, reason: outcome.error.message };
      }
      return { kind: 'failed', callId: recorded.callId, code: outcome.error.code };
    };

    const turn = {
      context: evalCase.context,
      history: evalCase.history ?? [],
      message: evalCase.message,
      tools: this.toolbox.toolsFor(evalCase.context),
    };
    const outcome = await runAssistLoop(round, this.toolbox, {
      prompt: {
        targetLanguage: targetLanguage ? languageName(targetLanguage) : UNKNOWN_TARGET,
        explanationLanguage: languageName(evalCase.explanationLanguage),
        contextKind: evalCase.context.kind,
      },
      turn,
      scope: { userId: EVAL_LEARNER, context: evalCase.context, language: evalCase.explanationLanguage },
    });
    // No gate under ModelCaller, so no refusal: anything but an answer is silence.
    return scoreAssistCase(evalCase, {
      outcome: outcome.kind === 'answered' ? { kind: 'answered', answer: outcome.answer } : { kind: 'silent', cause: outcomeCause(outcome) },
      calls: outcome.trace.calls,
      toolRounds: outcome.trace.toolRounds,
      toolCalls: outcome.trace.toolCalls,
      rejections: outcome.trace.rejections,
      latencyMs,
    });
  }
}

function outcomeCause(outcome: Awaited<ReturnType<typeof runAssistLoop>>): string {
  return outcome.kind === 'silent' ? outcome.cause : outcome.kind === 'refused' ? outcome.reason : 'answered';
}
