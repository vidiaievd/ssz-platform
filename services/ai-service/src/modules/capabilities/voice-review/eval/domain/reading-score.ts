/**
 * Gate Q5 of plan 82 (§5.4), as for review drafts in plan 79 Q2: at least this many prompts
 * heard and checked, and the machine's pass / fail the same as the teacher's on this share.
 */
export const READING_GATE = { minPrompts: 100, minAgreement: 0.85 } as const;

/**
 * How one prompt of the set went:
 *  - `ok` — heard and checked;
 *  - `error` — the candidate was called and failed (`errorCode` is the model's);
 *  - `skipped` — never called: no recording to hear (`recording_missing`, `recording_not_ready`,
 *    `media_unavailable`) or a take longer than the candidate hears (`audio_too_long`).
 */
export type PromptOutcome = 'ok' | 'error' | 'skipped';

/** One prompt of a run. Counts only — no passage, no transcript. */
export interface PromptResult {
  itemId: string;
  outcome: PromptOutcome;
  errorCode: string | null;
  teacherApproved: boolean;
  /** The engine's check on what the candidate heard; null unless `ok`. */
  machinePassed: boolean | null;
  /** Passage words read, whole percent; null unless `ok`. */
  percent: number | null;
  /** 0 when the candidate was not called. */
  latencyMs: number;
  /** Audio the candidate took; null when it gave none back. */
  audioMs: number | null;
}

export interface ReadingCaseResult {
  caseId: string;
  /** The mark the prompts were checked by. */
  passPercent: number;
  prompts: PromptResult[];
}

/** A run's verdict on the candidate. Rates are null when nothing could be counted for them. */
export interface ReadingRunScores {
  cases: number;
  /** Cases with every prompt heard — the ones a whole-reading verdict can be compared on. */
  casesHeard: number;
  prompts: number;
  heard: number;
  error: number;
  skipped: number;
  /** Heard prompts where the machine's pass / fail is the teacher's. */
  agreed: number;
  /** Heard prompts the machine passed and the teacher failed — the costly mistake. */
  falsePass: number;
  /** Heard prompts the machine failed and the teacher passed. */
  falseFail: number;
  /** `agreed / heard`. */
  agreement: number | null;
  /** Of the heard prompts the teacher failed, the share the machine passed. */
  falsePassRate: number | null;
  /** Of the heard prompts the teacher passed, the share the machine failed. */
  falseFailRate: number | null;
  /** Over `casesHeard`: "every prompt passed" the same for machine and teacher. */
  readingAgreement: number | null;
  /** Mean words-read percent over heard prompts the teacher passed / failed — where a mark would split them. */
  meanPercentApproved: number | null;
  meanPercentFailed: number | null;
  /** Mean over the prompts the candidate was called on. */
  avgLatencyMs: number | null;
  audioMs: number;
  /** Whether the run clears gate Q5 (`READING_GATE`). */
  gate: { minPrompts: number; minAgreement: number; met: boolean };
}

/**
 * The run's scores, prompt by prompt: a teacher rules a reading prompt by prompt, and so does
 * the machine (plan 82, Q4). A prompt the candidate did not hear is counted on its own and
 * never as a disagreement.
 */
export function summarizeReadings(results: ReadingCaseResult[]): ReadingRunScores {
  const prompts = results.flatMap((r) => r.prompts);
  const heard = prompts.filter((p) => p.outcome === 'ok');
  const approved = heard.filter((p) => p.teacherApproved);
  const failed = heard.filter((p) => !p.teacherApproved);
  const agreed = heard.filter((p) => p.machinePassed === p.teacherApproved).length;
  const falsePass = failed.filter((p) => p.machinePassed === true).length;
  const falseFail = approved.filter((p) => p.machinePassed === false).length;
  const fullyHeard = results.filter((r) => r.prompts.length > 0 && r.prompts.every((p) => p.outcome === 'ok'));
  const readingsAgreed = fullyHeard.filter(
    (r) => r.prompts.every((p) => p.machinePassed === true) === r.prompts.every((p) => p.teacherApproved),
  ).length;
  const called = prompts.filter((p) => p.outcome !== 'skipped');
  const agreement = rate(agreed, heard.length);

  return {
    cases: results.length,
    casesHeard: fullyHeard.length,
    prompts: prompts.length,
    heard: heard.length,
    error: prompts.filter((p) => p.outcome === 'error').length,
    skipped: prompts.filter((p) => p.outcome === 'skipped').length,
    agreed,
    falsePass,
    falseFail,
    agreement,
    falsePassRate: rate(falsePass, failed.length),
    falseFailRate: rate(falseFail, approved.length),
    readingAgreement: rate(readingsAgreed, fullyHeard.length),
    meanPercentApproved: mean(approved.map((p) => p.percent!)),
    meanPercentFailed: mean(failed.map((p) => p.percent!)),
    avgLatencyMs: called.length > 0 ? Math.round(called.reduce((sum, p) => sum + p.latencyMs, 0) / called.length) : null,
    audioMs: prompts.reduce((sum, p) => sum + (p.audioMs ?? 0), 0),
    gate: {
      ...READING_GATE,
      met: heard.length >= READING_GATE.minPrompts && agreement !== null && agreement >= READING_GATE.minAgreement,
    },
  };
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}

function mean(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10 : null;
}
