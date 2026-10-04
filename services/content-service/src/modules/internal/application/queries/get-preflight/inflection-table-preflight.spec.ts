import {
  sampleContent,
  toContent,
  toExpectedAnswers,
  type InflectionTableContent,
} from '@ssz/shared-kernel/inflection-table';
import { inflectionTableViolations } from './inflection-table-preflight.js';

// What earns this file: an asked cell without a key is dropped by the projection rather than
// shown, and the key — with every reason — is in the column only this query loads.

function exercise(doc: InflectionTableContent = sampleContent()) {
  return { id: 'ex-1', content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) };
}

const codesOf = (doc: InflectionTableContent) =>
  inflectionTableViolations(exercise(doc)).map((v) => [v.ruleCode, v.severity]);

/** The sample table with one cell edited. */
function withCell(
  rowId: string,
  slotId: string,
  patch: Partial<InflectionTableContent['rows'][number]['cells'][string]>,
): InflectionTableContent {
  const doc = sampleContent();
  return {
    ...doc,
    rows: doc.rows.map((r) =>
      r.id === rowId
        ? { ...r, cells: { ...r.cells, [slotId]: { ...r.cells[slotId], ...patch } } }
        : r,
    ),
  };
}

describe('inflectionTableViolations', () => {
  it('passes the finished sample', () => {
    expect(inflectionTableViolations(exercise())).toEqual([]);
  });

  it('blocks an asked cell without a key — the projection would drop it', () => {
    expect(codesOf(withCell('r2', 'defPl', { value: '' }))).toContainEqual([
      'INFLECTIONTABLE_IT_CELL_NO_KEY',
      'blocker',
    ]);
  });

  it('blocks a key without a reason, reading the reason from the key column', () => {
    const violations = inflectionTableViolations(exercise(withCell('r1', 'defSg', { why: '' })));
    expect(violations).toEqual([
      expect.objectContaining({
        ruleCode: 'INFLECTIONTABLE_IT_CELL_NO_WHY',
        severity: 'blocker',
        itemId: 'ex-1',
        detail: '1 cell has a key and no reason, so a wrong answer would be told only «wrong»',
      }),
    ]);
  });

  it('reports one violation per code, counting the cells', () => {
    const doc = sampleContent();
    const bare = {
      ...doc,
      rows: doc.rows.map((r) => ({
        ...r,
        cells: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, { ...c, why: '' }])),
      })),
    };
    const violations = inflectionTableViolations(exercise(bare));
    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toMatch(/^12 cells have a key/);
  });

  it('blocks a course language without a pack', () => {
    expect(codesOf({ ...sampleContent(), language: 'uk', packId: '' })).toEqual([
      ['INFLECTIONTABLE_IT_NO_PACK', 'blocker'],
    ]);
  });

  it('warns rather than blocks, and leaves info out of a container report', () => {
    const doc = sampleContent({ settings: { ...sampleContent().settings, revealKey: 'never' } });
    const unlinked = { ...doc, rows: doc.rows.map((r) => ({ ...r, dictId: null })) };
    expect(codesOf(unlinked)).toEqual([]);
    const bank = sampleContent({ input: { mode: 'bank', bankExtra: 0, shuffleRows: true } });
    expect(codesOf(bank)).toEqual([['INFLECTIONTABLE_IT_BANK_NO_EXTRA', 'warning']]);
  });
});
