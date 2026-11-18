import type {
  SweepAgeBasis,
  SweepKind,
  SweepRunMode,
  SweepRunRecord,
  SweepRunSummary,
} from '../../../domain/sweep-run.js';

export class GetSweepsOverviewQuery {}

export interface SweepRunView extends SweepRunRecord {
  /** The report in one shape for any kind; null while running or after an error. */
  summary: SweepRunSummary | null;
}

export interface SweepKindOverview {
  kind: SweepKind;
  /** Nightly cron, server time. */
  schedule: string;
  /** What a nightly run does (`MEDIA_ORPHAN_SWEEP_MODE`, shared by all four). */
  nightlyMode: SweepRunMode;
  /** Files younger than this are not looked at. */
  minAgeDays: number;
  /** What the age counts from. */
  ageBasis: SweepAgeBasis;
  /** Files looked at per run, at most (`MEDIA_ORPHAN_MAX_PER_RUN`). */
  maxPerRun: number;
  /** Newest first, at most `SWEEP_RECENT_RUNS`. */
  recentRuns: SweepRunView[];
}

export interface SweepsOverview {
  /** Days of run history kept. */
  historyDays: number;
  items: SweepKindOverview[];
}
