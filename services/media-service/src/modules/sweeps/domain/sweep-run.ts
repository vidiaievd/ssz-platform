/**
 * Media sweeps as the admin panel sees them (plan 90, phase 8, step 3): four kinds of run, who
 * started one, and what a finished run amounts to. The sweeps themselves live in the assets module.
 */

export const SWEEP_KINDS = [
  'orphan_recordings',
  'superseded_narrations',
  'abandoned_uploads',
  'orphan_content',
] as const;
export type SweepKind = (typeof SWEEP_KINDS)[number];

export const SWEEP_MODES = ['dry-run', 'delete'] as const;
export type SweepRunMode = (typeof SWEEP_MODES)[number];

/** `nightly` — the scheduler; `admin` — the platform admin panel; `operator` — `internal/…` by hand. */
export const SWEEP_TRIGGERS = ['nightly', 'admin', 'operator'] as const;
export type SweepTrigger = (typeof SWEEP_TRIGGERS)[number];

export function isSweepKind(value: unknown): value is SweepKind {
  return typeof value === 'string' && (SWEEP_KINDS as readonly string[]).includes(value);
}

/** Rows older than this are removed after each nightly run. */
export const SWEEP_HISTORY_DAYS = 90;

/** How many runs of each kind the overview shows. */
export const SWEEP_RECENT_RUNS = 10;

/**
 * Nightly schedule, server time (cron). The scheduler declares these; the overview shows them.
 * Orphan recordings first, after the evening's hand-ins and before the morning's.
 */
export const SWEEP_SCHEDULES: Readonly<Record<SweepKind, string>> = {
  orphan_recordings: '30 3 * * *',
  abandoned_uploads: '40 3 * * *',
  superseded_narrations: '45 3 * * *',
  orphan_content: '55 3 * * *',
};

/**
 * What a sweep's age limit is counted from: upload time for three kinds, the moment a narration
 * was replaced for `superseded_narrations` (its retention period, `NARRATION_RETENTION_DAYS`).
 */
export type SweepAgeBasis = 'created' | 'superseded';

export const SWEEP_AGE_BASIS: Readonly<Record<SweepKind, SweepAgeBasis>> = {
  orphan_recordings: 'created',
  superseded_narrations: 'superseded',
  abandoned_uploads: 'created',
  orphan_content: 'created',
};

export interface SweepRunRecord {
  id: string;
  kind: SweepKind;
  mode: SweepRunMode;
  trigger: SweepTrigger;
  actorId: string | null;
  /** The sweep's own report; null while the run is going or when it threw. */
  report: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date;
  /** null — still going, or the process died before it could write the end. */
  finishedAt: Date | null;
}

/** One shape for the four reports, so the panel can show "found / kept / deleted" for any kind. */
export interface SweepRunSummary {
  /** Files looked at. */
  scanned: number;
  /** Of those, still in use — never touched. */
  kept: number;
  /** Of those, what the sweep would delete (or did try to). */
  candidates: number;
  deleted: number;
  /** The service that owns the references did not answer; the run stopped. */
  aborted: boolean;
  /** Another run of the same kind was going; this one did nothing. */
  skipped: boolean;
}

function count(report: Record<string, unknown>, key: string): number {
  const value = report[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Reads a stored report into the common shape. Each kind names its candidates differently:
 * `orphans` (recordings, content files), `unused` (replaced narrations); every abandoned upload
 * that was scanned is a candidate, nothing is "in use" there.
 */
export function summarizeSweepReport(kind: SweepKind, report: Record<string, unknown> | null): SweepRunSummary | null {
  if (!report) return null;
  const scanned = count(report, 'scanned');
  const candidates =
    kind === 'abandoned_uploads'
      ? scanned
      : kind === 'superseded_narrations'
        ? count(report, 'unused')
        : count(report, 'orphans');
  return {
    scanned,
    kept: count(report, 'inUse'),
    candidates,
    deleted: count(report, 'deleted'),
    aborted: report['aborted'] === true,
    skipped: report['skipped'] === true,
  };
}
