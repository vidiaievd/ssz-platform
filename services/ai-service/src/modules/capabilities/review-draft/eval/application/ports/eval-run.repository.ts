import type { EvalRun, EvalRunFinish } from '../../domain/eval-run.js';
import type { CaseResult, RunScores } from '../../domain/eval-score.js';

export const EVAL_RUN_REPOSITORY = Symbol('IEvalRunRepository');

/**
 * Runs of every capability in one table; the scores and cases are stored as they are, so a
 * caller reads them back as the shape its capability wrote (`S`, `C`).
 */
export interface IEvalRunRepository<S = RunScores, C = CaseResult> {
  create(run: EvalRun<S, C>): Promise<void>;
  /** Only a `running` run is finished; false when it was not (already finished, unknown). */
  finish(id: string, finish: EvalRunFinish<S, C>, at: Date): Promise<boolean>;
  findById(id: string): Promise<EvalRun<S, C> | null>;
  /** Newest first. */
  list(capability: string, limit: number): Promise<EvalRun<S, C>[]>;
  /** Fails every run still `running` — they belong to a process that is gone. Returns how many. */
  failRunning(error: string, at: Date): Promise<number>;
}
