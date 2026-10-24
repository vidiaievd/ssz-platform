import type { EvalRun, EvalRunFinish } from '../../domain/eval-run.js';

export const EVAL_RUN_REPOSITORY = Symbol('IEvalRunRepository');

export interface IEvalRunRepository {
  create(run: EvalRun): Promise<void>;
  /** Only a `running` run is finished; false when it was not (already finished, unknown). */
  finish(id: string, finish: EvalRunFinish, at: Date): Promise<boolean>;
  findById(id: string): Promise<EvalRun | null>;
  /** Newest first. */
  list(capability: string, limit: number): Promise<EvalRun[]>;
  /** Fails every run still `running` — they belong to a process that is gone. Returns how many. */
  failRunning(error: string, at: Date): Promise<number>;
}
