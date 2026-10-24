import type { CaseResult, RunScores } from './eval-score.js';

export type EvalRunStatus = 'running' | 'done' | 'failed';

/** The binding a run is meant to be compared with, as it stood when the run started. */
export interface BindingAtStart {
  primaryModelId: string;
  fallbackModelId: string | null;
  promptVersion: string;
}

/** One candidate model's run over the labelled set (plan 79, step 1.6). No text. */
export interface EvalRun {
  id: string;
  capability: string;
  modelId: string;
  promptVersion: string;
  status: EvalRunStatus;
  startedBy: string;
  bindingAtStart: BindingAtStart | null;
  caseCount: number;
  skipped: Record<string, number>;
  scores: RunScores | null;
  cases: CaseResult[] | null;
  /** Sum over the run's calls; null when any call had no price. */
  cost: { micros: number; currency: string } | null;
  credits: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

/** What finishing a run writes. */
export type EvalRunFinish =
  | { status: 'done'; scores: RunScores; cases: CaseResult[]; cost: EvalRun['cost']; credits: string | null }
  | { status: 'failed'; error: string };

/**
 * The run's cost from its calls' ledger rows: a sum when every call was priced in one
 * currency, else unknown — a partial sum would understate what the run cost.
 */
export function totalCost(
  calls: Array<{ cost: { micros: number; currency: string } | null; credits: string | null }>,
): { cost: EvalRun['cost']; credits: string | null } {
  if (calls.length === 0) return { cost: null, credits: null };
  const priced = calls.every((c) => c.cost !== null && c.cost.currency === calls[0]!.cost?.currency);
  const cost = priced ? { micros: calls.reduce((sum, c) => sum + c.cost!.micros, 0), currency: calls[0]!.cost!.currency } : null;
  const credits = calls.every((c) => c.credits !== null)
    ? calls.reduce((sum, c) => sum + Number(c.credits), 0).toFixed(6)
    : null;
  return { cost, credits };
}
