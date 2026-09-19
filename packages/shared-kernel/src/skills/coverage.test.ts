// Plan 55 §3.7 and §3.10 — the three tallies, and printing the zeroes.

import { describe, expect, it } from 'vitest';

import { coverage, diff, diverges, share, tally } from './coverage.js';
import type { DeriveInput } from './derive.js';
import { deriveSkills } from './derive.js';

const ex = (templateCode: string, rest: Partial<DeriveInput> = {}): DeriveInput => ({
  templateCode,
  ...rest,
});

describe('tallies', () => {
  it('returns every bucket, including the zeroes', () => {
    // The rule of §3.10: "this course has no listening" is the most useful sentence the
    // report can produce, and it is indistinguishable from a missing key if dropped.
    const result = coverage([]);
    expect(result.bySkill).toEqual({ listening: 0, reading: 0, spoken: 0, written: 0 });
    expect(result.byFocus).toEqual({ vocabulary: 0, grammar: 0, orthography: 0, pragmatics: 0, unknown: 0 });
    expect(result.byForm).toEqual({ bank: 0, free: 0, mixed: 0, unknown: 0 });
    expect(result.emptySkills).toEqual(['listening', 'reading', 'spoken', 'written']);
    expect(result.total).toBe(0);
  });

  it('counts an exercise once per skill it trains', () => {
    const result = coverage([ex('short_answer')]);
    expect(result.total).toBe(1);
    expect(result.bySkill.reading).toBe(1);
    expect(result.bySkill.written).toBe(1);
  });

  it('keeps the focus tally summing to the number of exercises', () => {
    // Otherwise the column cannot be read as a share of anything.
    const result = coverage([ex('short_answer'), ex('error_correction'), ex('writing_task')]);
    const sum = Object.values(result.byFocus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.total);
    expect(result.byFocus.unknown).toBe(2);
    expect(result.byFocus.grammar).toBe(1);
  });

  it('answers the pair, which neither margin can', () => {
    // The point of the table: `match_pairs` is reading × vocabulary, `writing_task` is
    // written × unknown. Both margins of reading × unknown are non-zero and the pair
    // itself is empty — multiply the margins and the screen invents a cell.
    const result = coverage([ex('match_pairs'), ex('writing_task')]);
    expect(result.bySkill.reading).toBe(1);
    expect(result.byFocus.unknown).toBe(1);
    expect(result.byPair.reading.unknown).toBe(0);
    expect(result.byPair.reading.vocabulary).toBe(1);
    expect(result.byPair.written.unknown).toBe(1);
  });

  it('keeps every row of the table, zeroes included', () => {
    const result = coverage([]);
    expect(Object.keys(result.byPair)).toEqual(['listening', 'reading', 'spoken', 'written']);
    expect(result.byPair.listening).toEqual({
      vocabulary: 0,
      grammar: 0,
      orthography: 0,
      pragmatics: 0,
      unknown: 0,
    });
  });

  it('sums a row of the table to the skill margin', () => {
    const exercises = [ex('short_answer'), ex('error_correction'), ex('writing_task')];
    const result = coverage(exercises);
    for (const skill of ['listening', 'reading', 'spoken', 'written'] as const) {
      const row = Object.values(result.byPair[skill]).reduce((a, b) => a + b, 0);
      // True only while no exercise carries two subjects at once; the assertion is here
      // to notice the day one does, not to forbid it.
      expect(row).toBe(result.bySkill[skill]);
    }
  });

  it('names the skills nothing trains', () => {
    const result = coverage([ex('multiple_choice'), ex('match_pairs')]);
    expect(result.emptySkills).toEqual(['listening', 'spoken', 'written']);
  });

  it('counts an unknown template as unclassified rather than dropping it', () => {
    const result = coverage([ex('dictation_2027'), ex('short_answer')]);
    expect(result.unclassified).toBe(1);
    expect(result.total).toBe(2);
  });

  it('shows a recognition-heavy course for what it is', () => {
    // Four skills look balanced-ish; the form column is what says the learner never
    // produces anything.
    const exercises = [ex('multiple_choice'), ex('match_pairs'), ex('text_order'), ex('word_bank_fill')];
    const result = coverage(exercises);
    expect(result.byForm.bank).toBe(4);
    expect(result.byForm.free).toBe(0);
  });

  it('accepts profiles derived elsewhere', () => {
    const profiles = [ex('writing_task'), ex('match_pairs')].map(deriveSkills);
    expect(tally(profiles)).toEqual(coverage([ex('writing_task'), ex('match_pairs')]));
  });
});

describe('share', () => {
  it('is zero rather than NaN on an empty module', () => {
    expect(share(0, 0)).toBe(0);
  });
});

describe('divergence between versions (Q5)', () => {
  const draft = coverage([ex('short_answer', { content: { audio: { enabled: true } } }), ex('match_pairs')]);
  const published = coverage([ex('short_answer'), ex('match_pairs')]);

  it('is silent when the versions agree', () => {
    expect(diverges(published, published)).toBe(false);
    expect(diff(published, published)).toEqual([]);
  });

  it('names the cells that moved', () => {
    expect(diverges(draft, published)).toBe(true);
    const cells = diff(draft, published);
    expect(cells).toContainEqual({ axis: 'skill', key: 'listening', draft: 1, published: 0 });
    expect(cells).toContainEqual({ axis: 'skill', key: 'reading', draft: 1, published: 2 });
  });

  it('reports the form axis too, not only skills', () => {
    const a = coverage([ex('word_bank_gap_fill', { content: { settings: { input: 'free' } } })]);
    const b = coverage([ex('word_bank_gap_fill', { content: { settings: { input: 'bank' } } })]);
    expect(diff(a, b).some((cell) => cell.axis === 'form')).toBe(true);
  });
});

describe('the subject axis, counted in elements (plan 64, decision H)', () => {
  it('splits one exercise across the subjects its elements name', () => {
    const result = coverage([
      ex('multiple_choice', {
        atoms: [
          { atomType: 'vocabulary_item', itemKey: 'q1' },
          { atomType: 'grammar_rule_atom', itemKey: 'q2' },
          { atomType: 'grammar_rule_atom', itemKey: 'q3' },
          { atomType: 'grammar_rule_atom', itemKey: 'q4' },
        ],
      }),
    ]);

    // Counted once under each subject, as before …
    expect(result.byFocus.vocabulary).toBe(1);
    expect(result.byFocus.grammar).toBe(1);
    // … and by how much of the exercise each one actually is.
    expect(result.byFocusWeighted.vocabulary).toBeCloseTo(0.25);
    expect(result.byFocusWeighted.grammar).toBeCloseTo(0.75);
  });

  // Whatever is or is not recorded, the weighted tally has to stay readable as a
  // share of the exercises counted.
  it('still adds up to the exercises counted', () => {
    const result = coverage([
      ex('error_correction'),
      ex('writing_task'),
      ex('match_pairs', {
        atoms: [
          { atomType: 'vocabulary_item', itemKey: 'a' },
          { atomType: 'grammar_rule_atom', itemKey: 'b' },
        ],
      }),
    ]);

    const sum = Object.values(result.byFocusWeighted).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(3);
    expect(result.byFocusWeighted.unknown).toBe(1);
  });
});
