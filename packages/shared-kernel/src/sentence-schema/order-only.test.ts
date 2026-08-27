import { describe, expect, it } from 'vitest';

import { chunk, content, row } from './fixtures.test-support.js';
import {
  DEFAULT_SETTINGS,
  fieldsFor,
  isDeliverable,
  ORDER_FIELD_ID,
  type SentenceSchemaContent,
} from './model.js';
import { grade, initialPlacement, scoreRow, solution } from './grading.js';
import { issues } from './issues.js';
import { toStudentProjection } from './projection.js';

/** The same sentence, with nobody ever having said which field a word belongs to. */
function seq(overrides: Partial<SentenceSchemaContent> = {}): SentenceSchemaContent {
  return content({
    settings: { ...DEFAULT_SETTINGS, orderOnly: true },
    rows: [
      row({
        chunks: [
          chunk('c1', 'I morgen'),
          chunk('c2', 'skal'),
          chunk('c3', 'jeg'),
          chunk('c4', 'lese'),
        ],
        text: 'I morgen skal jeg lese',
      }),
    ],
    ...overrides,
  });
}

const inOrder = { [ORDER_FIELD_ID]: ['c1', 'c2', 'c3', 'c4'] };

describe('sequence-only · the board', () => {
  it('collapses the schema into one nameless slot', () => {
    const ex = seq();
    const fields = fieldsFor(ex, ex.rows[0]!);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.id).toBe(ORDER_FIELD_ID);
    // Nameless is the point: a learner asked for word order must not be reading a field
    // name, because the name is the claim this mode exists to stop making.
    expect(fields[0]!.short).toBe('');
    expect(fields[0]!.label).toBe('');
  });

  it('leaves the authored schema in the document, untouched', () => {
    // The mode is a switch, not a migration: turning it off returns the chart.
    expect(seq().schema.main).toHaveLength(6);
  });

  it('counts a sentence as finished as soon as it is written', () => {
    expect(isDeliverable(seq().rows[0]!, true)).toBe(true);
    // The very same row, judged as a schema exercise, is not.
    expect(isDeliverable(seq().rows[0]!)).toBe(false);
  });
});

describe('sequence-only · grading', () => {
  it('accepts the sentence in its own order', () => {
    const ex = seq();
    const marks = grade(ex.rows[0]!, fieldsFor(ex, ex.rows[0]!), inOrder, ex.settings);

    expect(marks.solved).toBe(true);
    expect(marks.wrong).toBe(0);
  });

  it('marks a piece that arrived too early as out of order', () => {
    const ex = seq();
    const swapped = { [ORDER_FIELD_ID]: ['c1', 'c3', 'c2', 'c4'] };
    const marks = grade(ex.rows[0]!, fieldsFor(ex, ex.rows[0]!), swapped, ex.settings);

    expect(marks.byItem['c2']).toBe('order');
    expect(marks.solved).toBe(false);
  });

  it('never says "wrong field" — there is no other field to be in', () => {
    const ex = seq();
    const marks = grade(ex.rows[0]!, fieldsFor(ex, ex.rows[0]!), inOrder, ex.settings);

    expect(Object.values(marks.byItem)).not.toContain('field');
  });

  it('still calls a distractor a distractor', () => {
    // `extra` is a different statement from `field`: not a piece of this sentence at all.
    const ex = seq();
    const withExtra = { [ORDER_FIELD_ID]: ['c1', 'x9', 'c2', 'c3', 'c4'] };
    const marks = grade(ex.rows[0]!, fieldsFor(ex, ex.rows[0]!), withExtra, ex.settings);

    expect(marks.byItem['x9']).toBe('extra');
  });

  it('grades strictly even where the author asked for loose order', () => {
    // `loose` would accept every board, which is not a difficulty setting but an off
    // switch for the exercise.
    const ex = seq({ settings: { ...DEFAULT_SETTINGS, orderOnly: true, order: 'loose' } });
    const swapped = { [ORDER_FIELD_ID]: ['c2', 'c1', 'c3', 'c4'] };

    expect(grade(ex.rows[0]!, fieldsFor(ex, ex.rows[0]!), swapped, ex.settings).solved).toBe(false);
  });

  it('reports an empty slot as awaiting the sentence', () => {
    const ex = seq();
    const marks = grade(ex.rows[0]!, fieldsFor(ex, ex.rows[0]!), {}, ex.settings);

    expect(marks.byField[ORDER_FIELD_ID]).toBe('bad');
    expect(marks.solved).toBe(false);
  });

  it('scores by pieces in place, not all-or-nothing', () => {
    const ex = seq();
    const fields = fieldsFor(ex, ex.rows[0]!);
    const swapped = { [ORDER_FIELD_ID]: ['c1', 'c3', 'c2', 'c4'] };
    const marks = grade(ex.rows[0]!, fields, swapped, ex.settings);

    // Three of the four pieces were accepted where they fell.
    expect(scoreRow(ex.rows[0]!, fields, marks, true)).toBe(75);
  });

  it('reveals the sentence as one slot in its own order', () => {
    expect(solution(seq().rows[0]!, true)).toEqual(inOrder);
  });

  it('pre-places the first piece into that slot', () => {
    expect(initialPlacement(seq().rows[0]!, 'first', true)).toEqual({
      [ORDER_FIELD_ID]: ['c1'],
    });
  });
});

describe('sequence-only · what the author is asked for', () => {
  it('raises no schema blockers, even with every clause type switched off', () => {
    const problems = issues(seq({ clauses: [] })).map((i) => i.code);

    expect(problems).not.toContain('NO_CLAUSE_ON');
    expect(problems).not.toContain('CLAUSE_NO_FIELDS');
    expect(problems).not.toContain('ROW_CLAUSE_OFF');
  });

  it('does not ask for placements that the exercise never uses', () => {
    const problems = issues(seq()).map((i) => i.code);

    expect(problems).not.toContain('ROW_UNPLACED');
    expect(problems).not.toContain('ROW_REQUIRED_FIELD_EMPTY');
    expect(problems).not.toContain('ROW_V2_VIOLATION');
    expect(problems).not.toContain('NO_DELIVERABLE_ROWS');
  });

  it('still asks for the sentence and for the rule behind it', () => {
    const problems = issues(seq({ rows: [row({ text: '', chunks: [], why: '' })] })).map(
      (i) => i.code,
    );

    expect(problems).toContain('ROW_NO_TEXT');
    expect(problems).toContain('NO_DELIVERABLE_ROWS');
  });

  it('still requires a rule on a written sentence', () => {
    const ex = seq();
    ex.rows[0]!.why = '';

    expect(issues(ex).map((i) => i.code)).toContain('ROW_NO_WHY');
  });
});

describe('sequence-only · what the student receives', () => {
  it('sends one slot and the pieces, and no count', () => {
    const ex = seq({ settings: { ...DEFAULT_SETTINGS, orderOnly: true, counts: true } });
    const projected = toStudentProjection(ex);

    expect(projected.rows).toHaveLength(1);
    expect(projected.rows[0]!.fields.map((f) => f.id)).toEqual([ORDER_FIELD_ID]);
    // The count would be the length of the sentence — visible in the bank already.
    expect(projected.rows[0]!.counts).toBeNull();
  });

  it('delivers a sentence whose words were never assigned to anything', () => {
    // The row has no `chunk.field` at all; as a schema exercise it would be dropped.
    expect(toStudentProjection(seq()).rows).toHaveLength(1);
    expect(toStudentProjection({ ...seq(), settings: DEFAULT_SETTINGS }).rows).toHaveLength(0);
  });
});
