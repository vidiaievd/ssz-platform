// IMPLEMENTATION.md: "each blocker and warning row in the README table fires exactly once
// and points at the right step." One test per row of both tables, plus the rail and the
// gate's green rows, which are filters over the same list and must not be able to disagree.

import { describe, expect, it } from 'vitest';

import { chunk, content, field, MAIN_FIELDS, row, schema } from './fixtures.test-support.js';
import { blockers, isReady, issues, passes, stepState, warnings } from './issues.js';

const codes = (ex: Parameters<typeof issues>[0]) => issues(ex).map((i) => i.code);

describe('blockers', () => {
  it('a clean document has none', () => {
    expect(blockers(content())).toEqual([]);
    expect(isReady(content())).toBe(true);
  });

  it('no clause type switched on', () => {
    expect(codes(content({ clauses: [] }))).toContain('NO_CLAUSE_ON');
  });

  it('a switched-on clause type with no fields', () => {
    const ex = content({ clauses: ['main', 'sub'] });
    const found = issues(ex).filter((i) => i.code === 'CLAUSE_NO_FIELDS');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: 'blocker', step: 1, clause: 'sub' });
  });

  it('an empty sentence, and nothing else about that card', () => {
    const ex = content({ rows: [row({ text: '   ', chunks: [], why: '' })] });

    expect(codes(ex)).toContain('ROW_NO_TEXT');
    // The blank card gets one blocker, not four: no unplaced count, no missing rule.
    expect(codes(ex)).not.toContain('ROW_UNPLACED');
    expect(codes(ex)).not.toContain('ROW_NO_WHY');
  });

  it('words left outside the schema, counted on the row', () => {
    const ex = content({
      rows: [row({ chunks: [chunk('c1', 'Jeg', 'n'), chunk('c2', 'leser', null), chunk('c3', 'boka', null)] })],
    });
    const found = issues(ex).filter((i) => i.code === 'ROW_UNPLACED');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: 'blocker', step: 2, rowId: 'r1', count: 2 });
  });

  it('zero deliverable sentences', () => {
    const ex = content({ rows: [row({ chunks: [chunk('c1', 'Jeg', null)] })] });

    expect(codes(ex)).toContain('NO_DELIVERABLE_ROWS');
  });

  it('a sentence with no rule explanation, named by row', () => {
    const found = issues(content({ rows: [row({ why: '  ' })] })).filter((i) => i.code === 'ROW_NO_WHY');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: 'blocker', step: 4, rowId: 'r1' });
  });
});

describe('warnings', () => {
  it('a sentence written in a switched-off clause type', () => {
    const ex = content({ clauses: ['sub'], schema: { ...schema(), sub: MAIN_FIELDS } });
    const found = warnings(ex).filter((i) => i.code === 'ROW_CLAUSE_OFF');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ step: 1, rowId: 'r1', clause: 'main' });
  });

  it('a non-optional field left empty in some sentence', () => {
    const ex = content({
      rows: [row({ text: 'Jeg leser', chunks: [chunk('c1', 'Jeg', 'n'), chunk('c2', 'leser', 'N')] })],
    });
    const found = warnings(ex).filter((i) => i.code === 'ROW_REQUIRED_FIELD_EMPTY');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ step: 2, rowId: 'r1', fieldId: 'v' });
  });

  it('more than one piece in the first field of a main clause', () => {
    const ex = content({
      rows: [
        row({
          chunks: [
            chunk('c1', 'I', 'F'),
            chunk('c2', 'morgen', 'F'),
            chunk('c3', 'skal', 'v'),
            chunk('c4', 'jeg', 'n'),
          ],
        }),
      ],
    });
    const found = warnings(ex).filter((i) => i.code === 'ROW_V2_VIOLATION');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ step: 2, rowId: 'r1', fieldId: 'F', count: 2 });
  });

  it('does not read V2 into a subordinate clause', () => {
    const sub = [field('k', 'k', 'Konjunksjon'), field('n', 'n', 'Subjekt')];
    const ex = content({
      clauses: ['sub'],
      schema: { ...schema(), sub },
      rows: [
        row({
          clause: 'sub',
          text: 'at han',
          chunks: [chunk('c1', 'at', 'k'), chunk('c2', 'han', 'k')],
        }),
      ],
    });

    expect(codes(ex)).not.toContain('ROW_V2_VIOLATION');
  });

  it('extras switched on with none written anywhere', () => {
    expect(codes(content())).toContain('EXTRAS_ON_BUT_NONE');
  });

  it('goes quiet once one sentence has an extra', () => {
    const ex = content({ rows: [row({ extras: [{ id: 'x1', text: 'blir' }] })] });

    expect(codes(ex)).not.toContain('EXTRAS_ON_BUT_NONE');
  });
});

describe('stepState — the rail reads the same list', () => {
  it('reports a blocker count on its own step and leaves the others clean', () => {
    const ex = content({ rows: [row({ why: '' })], settings: { ...content().settings, extras: false } });

    expect(stepState(ex, 4)).toEqual({ state: 'err', errors: 1, warnings: 0 });
    expect(stepState(ex, 1).state).toBe('ok');
    expect(stepState(ex, 2).state).toBe('ok');
  });

  it('warns rather than errs when only warnings are on the step', () => {
    expect(stepState(content(), 3)).toEqual({ state: 'warn', errors: 0, warnings: 1 });
  });

  it('cannot disagree with the gate', () => {
    const ex = content({ clauses: [], rows: [row({ why: '' })] });
    const railErrors = ([1, 2, 3, 4] as const).reduce((n, step) => n + stepState(ex, step).errors, 0);

    expect(railErrors).toBe(blockers(ex).length);
  });
});

describe('passes — the gate’s green rows', () => {
  it('counts what the exercise does have', () => {
    const ex = content({
      rows: [
        row({ chunks: [chunk('c1', 'I morgen', 'F', ['A']), chunk('c2', 'skal', 'v')], fb: { c1: 'Fronted.' } }),
        row({ id: 'r2', text: 'Jeg leser', chunks: [chunk('d1', 'Jeg', 'n'), chunk('d2', 'leser', 'v')] }),
      ],
    });

    expect(passes(ex)).toEqual({
      deliverableRows: 2,
      clausesCovered: ['main'],
      rowsWithAlternatives: 1,
      chunkNotes: 1,
    });
  });

  it('does not count an undeliverable row', () => {
    const ex = content({ rows: [row({ chunks: [chunk('c1', 'Jeg', null)] })] });

    expect(passes(ex).deliverableRows).toBe(0);
  });
});
