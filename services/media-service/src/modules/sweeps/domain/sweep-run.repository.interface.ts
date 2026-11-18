import type { SweepKind, SweepRunMode, SweepRunRecord, SweepTrigger } from './sweep-run.js';

export const SWEEP_RUN_REPOSITORY = Symbol('SWEEP_RUN_REPOSITORY');

export interface StartSweepRun {
  kind: SweepKind;
  mode: SweepRunMode;
  trigger: SweepTrigger;
  actorId: string | null;
  startedAt: Date;
}

export interface FinishSweepRun {
  report: Record<string, unknown> | null;
  error: string | null;
  finishedAt: Date;
}

export interface ISweepRunRepository {
  /** Writes the row of a run that is starting; returns its id. */
  start(run: StartSweepRun): Promise<string>;
  finish(id: string, end: FinishSweepRun): Promise<void>;
  /** The newest `limit` runs of each kind, newest first. */
  recentByKind(limit: number): Promise<Record<SweepKind, SweepRunRecord[]>>;
  /** Removes runs started before `before`; returns how many. */
  deleteStartedBefore(before: Date): Promise<number>;
}
