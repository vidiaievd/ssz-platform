import { describe, expect, it } from 'vitest';

import type { Check, Flow, Hints, Item, Mode } from './model.js';
import { DEFAULT_CHECK, DEFAULT_FLOW, DEFAULT_HINTS, EMPTY_EDITS } from './model.js';
import { selfCheckFeedback, toStudentProjection } from './projection.js';

const items: Item[] = [
  {
    id: 'i1',
    wrong: 'I går jeg gikk på kino.',
    ref: 'I går gikk jeg på kino.',
    alts: [],
    meta: {},
    hint: 'Hva skjer med verbet?',
    teacherNote: 'V2-regelen.',
  },
  {
    id: 'i2',
    wrong: 'Hun har bodde i Bergen.',
    ref: 'Hun har bodd i Bergen.',
    alts: [],
    meta: {},
  },
];

function task(hints: Partial<Hints> = {}, extra: { mode?: Mode; check?: Check; flow?: Flow } = {}) {
  return {
    mode: extra.mode ?? ('sentences' as Mode),
    note: 'Fra leksjon 4.',
    items,
    hints: { ...DEFAULT_HINTS, ...hints },
    check: extra.check ?? DEFAULT_CHECK,
    flow: extra.flow ?? DEFAULT_FLOW,
  };
}

/** Every string anywhere in the projection, however deeply nested. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(allStrings);
  return [];
}

describe('toStudentProjection', () => {
  it('sends the faulty sentence and never the key, the variants or the teacher note', () => {
    const strings = allStrings(toStudentProjection(task()));

    expect(strings).toContain('I går jeg gikk på kino.');
    expect(strings).not.toContain('I går gikk jeg på kino.');
    expect(strings).not.toContain('Hun har bodd i Bergen.');
    expect(strings).not.toContain('V2-regelen.');
  });

  it('tokenises the sentence so both sides index words the same way', () => {
    const projected = toStudentProjection(task());

    expect(projected.items[0]?.words).toEqual(['I', 'går', 'jeg', 'gikk', 'på', 'kino.']);
  });

  it('tells the student how many mistakes there are only when the setting says so', () => {
    const shown = toStudentProjection(task({ count: true }));
    const hidden = toStudentProjection(task({ count: false }));

    expect(shown.totalErrors).toBe(2);
    expect(shown.items[0]?.errorCount).toBe(1);
    expect(hidden.totalErrors).toBeUndefined();
    expect(hidden.items[0]?.errorCount).toBeUndefined();
  });

  it('names the types only when showType is on — and never where they are', () => {
    const shown = toStudentProjection(task({ showType: true }));

    expect(shown.items[0]?.errorTypes).toEqual(['order']);
    expect(toStudentProjection(task({ showType: false })).items[0]?.errorTypes).toBeUndefined();
  });

  it('withholds the author hint when hints are switched off', () => {
    expect(toStudentProjection(task({ hintText: false })).items[0]?.hint).toBeUndefined();
    expect(toStudentProjection(task({ hintText: true })).items[0]?.hint).toBe('Hva skjer med verbet?');
  });

  it('leaves a soft span out of the count the student is given', () => {
    const softened: Item = { ...items[1]!, meta: { '2:3:bodd': { soft: true } } };
    const projected = toStudentProjection({ ...task(), items: [softened] });

    expect(projected.totalErrors).toBe(0);
  });
});

describe('selfCheckFeedback', () => {
  it('says how many mistakes are corrected and never which words are left', () => {
    const feedback = selfCheckFeedback(
      { items, check: DEFAULT_CHECK, hints: DEFAULT_HINTS },
      { i1: { marked: { 2: true, 3: true }, fix: { 2: 'gikk', 3: 'jeg' }, ins: {} } },
    );

    expect(feedback.fixedCount).toBe(1);
    expect(feedback.spanCount).toBe(2);
    expect(feedback.items[0]).toMatchObject({ itemId: 'i1', fixedCount: 1, fixedSpans: [true] });
    expect(allStrings(feedback)).not.toContain('gikk jeg');
  });

  it('counts nothing as fixed before the student starts', () => {
    const feedback = selfCheckFeedback(
      { items, check: DEFAULT_CHECK, hints: DEFAULT_HINTS },
      { i1: EMPTY_EDITS },
    );

    expect(feedback.fixedCount).toBe(0);
    expect(feedback.items[0]?.fixedSpans).toEqual([false]);
  });

  it('reports an edit made where there was no mistake', () => {
    const feedback = selfCheckFeedback(
      { items, check: DEFAULT_CHECK, hints: DEFAULT_HINTS },
      { i1: { marked: { 5: true }, fix: { 5: 'teater.' }, ins: {} } },
    );

    expect(feedback.items[0]?.strayEdits).toBe(1);
  });

  it('names the remaining types only when showType is on', () => {
    const withTypes = selfCheckFeedback(
      { items, check: DEFAULT_CHECK, hints: { ...DEFAULT_HINTS, showType: true } },
      {},
    );
    const without = selfCheckFeedback({ items, check: DEFAULT_CHECK, hints: DEFAULT_HINTS }, {});

    expect(withTypes.items[0]?.remainingTypes).toEqual(['order']);
    expect(without.items[0]?.remainingTypes).toBeUndefined();
  });
});
