// Remarks about the balance of a module — plan 55 §1.7 and the decision in §12.6 of the
// audit.
//
// Same shape as the nine per-type kernels: a code and the numbers its message needs,
// never the message itself, because the authoring UI is localised into four languages
// and English prose in shared logic could not be rendered (plan 53 §3.6).
//
// **Not one blocker in this file, and that is a decision rather than an oversight.** An
// unbalanced lesson stays a publishable lesson. A publish gate on coverage would not be
// validation — it would be taste wearing the uniform of a rule, and the first author to
// meet it would learn to add one throwaway listening exercise to get past it.

import type { Coverage } from './coverage.js';
import { share } from './coverage.js';
import type { Skill } from './model.js';

export type CoverageIssueLevel = 'warning' | 'info';

export type CoverageIssue =
  /** Nothing in this module trains a whole channel. */
  | { code: 'COV_SKILL_ABSENT'; level: 'warning'; skill: Skill }
  /** Everything trains one channel. Balanced-looking counts can still hide this. */
  | { code: 'COV_SINGLE_SKILL'; level: 'warning'; skill: Skill; total: number }
  /** Recognition all the way down: the learner never produces anything. */
  | { code: 'COV_NO_FREE_PRODUCTION'; level: 'warning'; total: number }
  /** Mostly recognition. The share is reported so the message can quote it. */
  | { code: 'COV_MOSTLY_BANK'; level: 'info'; bank: number; total: number }
  /** The subject of most exercises is unknown — usually an empty atom graph. */
  | { code: 'COV_FOCUS_UNKNOWN'; level: 'info'; unknown: number; total: number }
  /** A template code the table does not know. Silent under-counting otherwise. */
  | { code: 'COV_UNCLASSIFIED'; level: 'warning'; count: number };

export interface CoverageIssueOptions {
  /** Below this many exercises a module is a fragment, and remarks about balance are noise. */
  minExercises?: number;
  /** `byForm.bank` share above which the module is called recognition-heavy. */
  bankShareThreshold?: number;
  /** `byFocus.unknown` share above which the subject is called unknown. */
  focusUnknownThreshold?: number;
}

const DEFAULTS = {
  minExercises: 4,
  bankShareThreshold: 0.8,
  focusUnknownThreshold: 0.8,
} as const;

/**
 * `spoken` is deliberately not reported as an absent skill.
 *
 * The platform has no way to record or judge speech: no template produces it, so every
 * module on the platform would carry the same remark, every time, and a remark that is
 * always true is one nobody reads. The zero itself still appears in `emptySkills` and in
 * the tally — the report says it once, plainly, instead of nagging about it per module.
 */
const NAGGING = new Set<Skill>(['spoken']);

export function coverageIssues(
  coverage: Coverage,
  options: CoverageIssueOptions = {},
): CoverageIssue[] {
  const { minExercises, bankShareThreshold, focusUnknownThreshold } = { ...DEFAULTS, ...options };
  const issues: CoverageIssue[] = [];

  if (coverage.unclassified > 0)
    issues.push({ code: 'COV_UNCLASSIFIED', level: 'warning', count: coverage.unclassified });

  if (coverage.total < minExercises) return issues;

  for (const skill of coverage.emptySkills)
    if (!NAGGING.has(skill)) issues.push({ code: 'COV_SKILL_ABSENT', level: 'warning', skill });

  const trained = (['listening', 'reading', 'spoken', 'written'] as const).filter(
    (skill) => coverage.bySkill[skill] > 0,
  );
  const only = trained.length === 1 ? trained[0] : undefined;
  if (only) issues.push({ code: 'COV_SINGLE_SKILL', level: 'warning', skill: only, total: coverage.total });

  if (coverage.byForm.free === 0 && coverage.byForm.mixed === 0)
    issues.push({ code: 'COV_NO_FREE_PRODUCTION', level: 'warning', total: coverage.total });
  else if (share(coverage.byForm.bank, coverage.total) > bankShareThreshold)
    issues.push({
      code: 'COV_MOSTLY_BANK',
      level: 'info',
      bank: coverage.byForm.bank,
      total: coverage.total,
    });

  if (share(coverage.byFocus.unknown, coverage.total) > focusUnknownThreshold)
    issues.push({
      code: 'COV_FOCUS_UNKNOWN',
      level: 'info',
      unknown: coverage.byFocus.unknown,
      total: coverage.total,
    });

  return issues;
}

export function warnings(issues: readonly CoverageIssue[]): CoverageIssue[] {
  return issues.filter((issue) => issue.level === 'warning');
}
