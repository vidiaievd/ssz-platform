import { describe, expect, it } from 'vitest';

import type { MatchTask } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import { shuffled } from './selectors.js';
import { toStudentProjection } from './projection.js';

const task: MatchTask = {
  variant: 'halves',
  settings: { ...DEFAULT_SETTINGS, shuffle: false },
  pairs: [
    { id: 'p1', rightId: 'q1', left: 'Hvis det regner i morgen,', right: 'blir vi hjemme.' },
    { id: 'p2', rightId: 'q2', left: 'Jeg rakk ikke bussen fordi', right: 'jeg sto opp for sent.' },
    { id: 'p3', rightId: 'q3', left: 'Da vi var barn,', right: 'bodde vi i Bergen.' },
    { id: 'p4', rightId: 'q4', left: 'Halv', right: '' },
  ],
  distractors: [
    { id: 'd1', text: 'vi bodde i Bergen.' },
    { id: 'd2', text: '   ' },
  ],
};

describe('toStudentProjection', () => {
  it('gives one slot per complete pair, in author order', () => {
    expect(toStudentProjection(task).slots).toEqual([
      { slotId: 'p1', left: 'Hvis det regner i morgen,' },
      { slotId: 'p2', left: 'Jeg rakk ikke bussen fordi' },
      { slotId: 'p3', left: 'Da vi var barn,' },
    ]);
  });

  it('gives a pool where an answer and a distractor are the same shape', () => {
    expect(toStudentProjection(task).pool).toEqual([
      { itemId: 'q1', text: 'blir vi hjemme.' },
      { itemId: 'q2', text: 'jeg sto opp for sent.' },
      { itemId: 'q3', text: 'bodde vi i Bergen.' },
      { itemId: 'd1', text: 'vi bodde i Bergen.' },
    ]);
  });

  it('shares no identifier between a slot and a pool item', () => {
    // AC-S15, and the reason `RightId` is not `PairId`. Asserted rather than reviewed:
    // this is the property that stops the payload from being the answer key.
    const projection = toStudentProjection(task);
    const slotIds = new Set(projection.slots.map((slot) => slot.slotId));
    expect(projection.pool.some((item) => slotIds.has(item.itemId))).toBe(false);
  });

  it('carries no answer, no explanation and no hint of which item is which', () => {
    const serialised = JSON.stringify(toStudentProjection(task));
    expect(serialised).not.toContain('kind');
    expect(serialised).not.toContain('answer');
    expect(serialised).not.toContain('distractor');
    // `right` never appears as a field, only as pool text with no owner.
    expect(serialised).not.toContain('"right"');
  });

  it('applies the injected shuffle when the setting is on', () => {
    const on: MatchTask = { ...task, settings: { ...task.settings, shuffle: true } };
    const projection = toStudentProjection(on, { shuffle: (pool) => shuffled(pool, 3) });

    expect(projection.pool.map((item) => item.itemId).sort()).toEqual(['d1', 'q1', 'q2', 'q3']);
    expect(projection.pool.map((item) => item.itemId)).not.toEqual(['q1', 'q2', 'q3', 'd1']);
  });

  it('leaves the order alone when shuffling is off, whatever was injected', () => {
    const projection = toStudentProjection(task, { shuffle: () => [] });
    expect(projection.pool).toHaveLength(4);
  });

  it('does not pretend to shuffle when the caller supplied no shuffler', () => {
    // Author order lists every answer first, in slot order. Silence about that would be
    // worse than the order itself: the caller is the one that can fix it.
    const on: MatchTask = { ...task, settings: { ...task.settings, shuffle: true } };
    expect(toStudentProjection(on).pool.map((item) => item.itemId)).toEqual([
      'q1',
      'q2',
      'q3',
      'd1',
    ]);
  });

  it('hides the extras when they are switched off', () => {
    const off: MatchTask = { ...task, settings: { ...task.settings, distractors: false } };
    expect(toStudentProjection(off).pool.map((item) => item.itemId)).toEqual(['q1', 'q2', 'q3']);
  });

  it('carries only the setting that changes what the student sees', () => {
    expect(toStudentProjection(task).settings).toEqual({ showRemaining: true });
  });

  it('projects an empty exercise as empty rather than throwing', () => {
    // AC-S18: the runner needs something to render its "no pairs yet" state from.
    const blank: MatchTask = { ...task, pairs: [], distractors: [] };
    expect(toStudentProjection(blank)).toMatchObject({ slots: [], pool: [] });
  });
});
