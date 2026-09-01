// Plan 55 §12.6 of the audit — remarks, never a gate.

import { describe, expect, it } from 'vitest';

import { coverage } from './coverage.js';
import type { DeriveInput } from './derive.js';
import { coverageIssues, warnings } from './issues.js';

const ex = (templateCode: string, rest: Partial<DeriveInput> = {}): DeriveInput => ({
  templateCode,
  ...rest,
});

const listening = () => ex('short_answer', { content: { audio: { enabled: true } } });

describe('levels', () => {
  it('never returns a blocker', () => {
    // An unbalanced lesson is still a publishable lesson. A gate here would be taste in
    // the uniform of a rule.
    const worst = coverage([ex('multiple_choice'), ex('multiple_choice'), ex('multiple_choice'), ex('dictation_x')]);
    for (const issue of coverageIssues(worst)) expect(issue.level).not.toBe('blocker');
  });
});

describe('what it says', () => {
  it('stays quiet about a fragment', () => {
    // Three exercises is not a module with a balance problem, it is a module in progress.
    expect(coverageIssues(coverage([ex('multiple_choice'), ex('multiple_choice')]))).toEqual([]);
  });

  it('reports a missing channel once the module is big enough', () => {
    const issues = coverageIssues(
      coverage([ex('multiple_choice'), ex('match_pairs'), ex('text_order'), ex('word_bank_fill')]),
    );
    expect(issues).toContainEqual({ code: 'COV_SKILL_ABSENT', level: 'warning', skill: 'listening' });
    expect(issues).toContainEqual({ code: 'COV_SKILL_ABSENT', level: 'warning', skill: 'written' });
  });

  it('never nags about speech', () => {
    // Nothing on the platform can record it, so every module would carry the same line
    // every time — and a remark that is always true is one nobody reads.
    const issues = coverageIssues(coverage([ex('short_answer'), ex('writing_task'), listening(), ex('match_pairs')]));
    expect(issues.some((i) => i.code === 'COV_SKILL_ABSENT' && i.skill === 'spoken')).toBe(false);
  });

  it('calls out a module that trains one channel only', () => {
    const issues = coverageIssues(
      coverage([ex('multiple_choice'), ex('match_pairs'), ex('text_order'), ex('word_bank_fill')]),
    );
    expect(issues).toContainEqual({
      code: 'COV_SINGLE_SKILL',
      level: 'warning',
      skill: 'reading',
      total: 4,
    });
  });

  it('warns when nothing is ever produced', () => {
    const issues = coverageIssues(
      coverage([ex('multiple_choice'), ex('match_pairs'), ex('text_order'), ex('word_bank_fill')]),
    );
    expect(issues).toContainEqual({ code: 'COV_NO_FREE_PRODUCTION', level: 'warning', total: 4 });
  });

  it('downgrades to info once some production exists but recognition dominates', () => {
    const exercises = [
      ...Array.from({ length: 9 }, () => ex('multiple_choice')),
      ex('writing_task'),
    ];
    const issues = coverageIssues(coverage(exercises));
    expect(issues.some((i) => i.code === 'COV_NO_FREE_PRODUCTION')).toBe(false);
    expect(issues).toContainEqual({ code: 'COV_MOSTLY_BANK', level: 'info', bank: 9, total: 10 });
  });

  it('says the subject is unknown when the atom graph is empty', () => {
    // The common case today: not one ContentRelation row is seeded.
    const issues = coverageIssues(
      coverage([ex('short_answer'), ex('writing_task'), ex('translate_to_target'), listening()]),
    );
    expect(issues).toContainEqual({ code: 'COV_FOCUS_UNKNOWN', level: 'info', unknown: 4, total: 4 });
  });

  it('reports an unknown template even in a module too small to judge', () => {
    // A code the table does not know is under-counting, not a matter of balance — so it
    // is the one remark that survives the size threshold.
    const issues = coverageIssues(coverage([ex('dictation_2027')]));
    expect(issues).toEqual([{ code: 'COV_UNCLASSIFIED', level: 'warning', count: 1 }]);
  });

  it('has nothing to say about a balanced module', () => {
    const issues = coverageIssues(
      coverage([listening(), ex('short_answer'), ex('writing_task'), ex('error_correction'), ex('match_pairs')]),
    );
    expect(warnings(issues)).toEqual([]);
  });
});

describe('thresholds', () => {
  it('are overridable by the caller', () => {
    const exercises = [ex('multiple_choice'), ex('multiple_choice'), ex('writing_task')];
    expect(coverageIssues(coverage(exercises))).toEqual([]);
    expect(coverageIssues(coverage(exercises), { minExercises: 3, bankShareThreshold: 0.5 })).toContainEqual({
      code: 'COV_MOSTLY_BANK',
      level: 'info',
      bank: 2,
      total: 3,
    });
  });
});
