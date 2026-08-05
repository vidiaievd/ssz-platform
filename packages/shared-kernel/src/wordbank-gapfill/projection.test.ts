import { describe, expect, it } from 'vitest';

import type { GapFillTask } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import { toStudentProjection } from './projection.js';
import { answers } from './selectors.js';

function makeTask(overrides: Partial<GapFillTask> = {}): GapFillTask {
  return {
    settings: { ...DEFAULT_SETTINGS, shuffle: false },
    sentences: [
      { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3], hint: 'infinitiv' },
      { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3] },
    ],
    distractors: ['bestilt', 'regning'],
    ...overrides,
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
  it('cuts the answer out of the sentence and keeps its punctuation', () => {
    const projected = toStudentProjection(makeTask());
    expect(projected.sentences[1]?.tokens).toEqual([
      { kind: 'text', text: 'Kan' },
      { kind: 'text', text: 'jeg' },
      { kind: 'text', text: 'få' },
      { kind: 'gap', gapKey: 's2#3', label: 'G2', before: '', after: ',' },
      { kind: 'text', text: 'takk?' },
    ]);
  });

  it('keeps the quotes that surrounded a hidden word', () => {
    const projected = toStudentProjection(
      makeTask({ sentences: [{ id: 's1', text: 'Han sa «bestille».', gaps: [2] }] }),
    );
    expect(projected.sentences[0]?.tokens[2]).toEqual({
      kind: 'gap',
      gapKey: 's1#2',
      label: 'G1',
      before: '«',
      after: '».',
    });
  });

  it('carries the hint, which is written to be safe to show', () => {
    expect(toStudentProjection(makeTask()).sentences[0]?.hint).toBe('infinitiv');
    expect(toStudentProjection(makeTask()).sentences[1]).not.toHaveProperty('hint');
  });

  // The point of the whole file. The bank is *supposed* to contain the answers — that is
  // what a word bank is. What must never survive the projection is an answer left
  // standing in its own sentence, which is where this template keeps them.
  it('leaves no answer anywhere in the sentences', () => {
    const task = makeTask();
    const strings = allStrings(toStudentProjection(task).sentences);
    for (const answer of answers(task)) {
      expect(strings.some((text) => text.includes(answer))).toBe(false);
    }
  });

  it('leaves no answer anywhere at all in free mode, where there is no bank', () => {
    const task = makeTask({ settings: { ...DEFAULT_SETTINGS, input: 'free' } });
    const strings = allStrings(toStudentProjection(task));
    for (const answer of answers(task)) {
      expect(strings.some((text) => text.includes(answer))).toBe(false);
    }
  });

  it('does not disclose the answers through the bank order', () => {
    // `bank()` lists answers first. Serving that would make the first two chips the two
    // answers, in gap order — the exercise solved by position.
    const projected = toStudentProjection(makeTask());
    expect(projected.bank).toEqual(['bestille', 'bestilt', 'regning', 'regningen']);
    expect(projected.bank).not.toEqual(['bestille', 'regningen', 'bestilt', 'regning']);
  });

  it('shuffles when asked, and only then', () => {
    const reverse = (words: string[]) => [...words].reverse();
    const stable = toStudentProjection(makeTask(), { shuffle: reverse });
    expect(stable.bank).toEqual(['bestille', 'bestilt', 'regning', 'regningen']);

    const shuffled = toStudentProjection(
      makeTask({ settings: { ...DEFAULT_SETTINGS, shuffle: true } }),
      { shuffle: reverse },
    );
    expect(shuffled.bank).toEqual(['regningen', 'regning', 'bestilt', 'bestille']);
  });

  it('has no bank at all in free mode', () => {
    const projected = toStudentProjection(
      makeTask({ settings: { ...DEFAULT_SETTINGS, input: 'free' } }),
    );
    expect(projected.bank).toBeNull();
    expect(projected.settings.input).toBe('free');
  });

  it('passes on only the settings that change what the student sees', () => {
    expect(toStudentProjection(makeTask()).settings).toEqual({
      allowReuse: false,
      showBankCount: true,
      input: 'bank',
    });
  });

  it('leaves a sentence with no gaps entirely as text', () => {
    const projected = toStudentProjection(
      makeTask({ sentences: [{ id: 's1', text: 'Ingen luker her.', gaps: [] }], distractors: [] }),
    );
    expect(projected.sentences[0]?.tokens.every((token) => token.kind === 'text')).toBe(true);
  });

  it('ignores a gap index the sentence no longer reaches', () => {
    const projected = toStudentProjection(
      makeTask({ sentences: [{ id: 's1', text: 'Takk!', gaps: [4] }], distractors: [] }),
    );
    expect(projected.sentences[0]?.tokens).toEqual([{ kind: 'text', text: 'Takk!' }]);
  });
});
