import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { SweepKind, SweepRunMode, SweepRunSummary } from '../../../domain/sweep-run.js';
import type { AnySweepReport } from '../../sweep-runner.js';

/** A sweep run from the admin panel (plan 90, phase 8, step 4). */
export class RunSweepCommand {
  constructor(
    readonly kind: SweepKind,
    readonly dryRun: boolean,
    /** Required for a delete run (trimmed, ≤ 500); ignored for a dry run, which is not on the trail. */
    readonly reason: string | undefined,
    readonly actor: AdminActor,
  ) {}
}

export interface RunSweepResult {
  /** The `sweep_runs` row; null when history could not be written (the sweep still ran). */
  runId: string | null;
  kind: SweepKind;
  mode: SweepRunMode;
  report: AnySweepReport;
  summary: SweepRunSummary;
}
