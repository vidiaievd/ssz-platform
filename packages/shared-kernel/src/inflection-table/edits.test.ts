// Pure edits — DECISIONS §1 (columns from the pack, a paradigm switch clears the rows) and the
// prototype's step 2–4 mutations (IT-B2, IT-B3, IT-B4, IT-B6, IT-B9).

import { describe, expect, it } from 'vitest';

import { fromDictionary } from './dictionary.js';
import {
  addAccept,
  addManualRow,
  addRow,
  bulkFirstGiven,
  bulkOpenAll,
  canAddRow,
  pickParadigm,
  previewParadigmSwitch,
  removeAccept,
  removeRow,
  setCellMode,
  toggleSlot,
  updateInput,
  updateSettings,
} from './edits.js';
import { sampleContent } from './fixture.js';
import { emptyContent, IT_MAX_ROWS, paradigmOf, slotsInPlay } from './model.js';
import { packFor } from './packs.js';

describe('the paradigm', () => {
  it('IT-B4: a switch says what it costs before it happens', () => {
    expect(previewParadigmSwitch(sampleContent(), 'verb')).toEqual({ rowsCleared: 4 });
    expect(previewParadigmSwitch(sampleContent(), 'noun')).toEqual({ rowsCleared: 0 });
  });

  it('IT-B4: switching puts every slot in play and clears the rows', () => {
    const ex = pickParadigm(sampleContent(), 'verb');
    expect(ex.paradigmId).toBe('verb');
    expect(ex.slots).toEqual(['inf', 'pres', 'pret', 'perf']);
    expect(ex.rows).toEqual([]);
  });

  it('an unknown paradigm changes nothing', () => {
    const ex = sampleContent();
    expect(pickParadigm(ex, 'dual')).toBe(ex);
  });
});

describe('slots', () => {
  it('IT-B3: keep the pack’s order whatever order they are switched on in', () => {
    let ex = toggleSlot(toggleSlot(sampleContent(), 'defSg'), 'indefSg');
    expect(ex.slots).toEqual(['indefPl', 'defPl']);
    ex = toggleSlot(toggleSlot(ex, 'defSg'), 'indefSg');
    expect(ex.slots).toEqual(['indefSg', 'defSg', 'indefPl', 'defPl']);
  });

  it('IT-B2: a slot the pack does not have cannot be added', () => {
    const ex = sampleContent();
    expect(toggleSlot(ex, 'dative')).toBe(ex);
  });

  it('a slot switched off keeps its cells for when it comes back', () => {
    const off = toggleSlot(sampleContent(), 'defSg');
    expect(slotsInPlay(off).map((s) => s.id)).not.toContain('defSg');
    expect(off.rows[1]?.cells['defSg']?.why).toContain('Hunkjønn');
  });
});

describe('rows', () => {
  it('IT-B6: neither path goes past ten rows', () => {
    let ex = emptyContent('nb');
    for (let i = 0; i < IT_MAX_ROWS + 2; i += 1) ex = addManualRow(ex);
    expect(ex.rows).toHaveLength(IT_MAX_ROWS);
    expect(canAddRow(ex)).toBe(false);

    const pack = packFor('nb')!;
    const paradigm = paradigmOf(ex)!;
    const row = fromDictionary(
      { id: 'v9', word: 'katt', pos: 'NOUN', gloss: 'cat', unit: '', properties: {} },
      pack,
      paradigm,
      slotsInPlay(ex),
    );
    expect(addRow(ex, row).rows).toHaveLength(IT_MAX_ROWS);
  });

  it('a dictionary entry already in the table is not added twice', () => {
    const ex = sampleContent();
    const twin = { ...ex.rows[0]!, id: 'other' };
    expect(addRow(ex, twin).rows).toHaveLength(4);
  });

  it('a typed lemma is empty, not linked, first slot given', () => {
    const row = addManualRow(sampleContent()).rows[4]!;
    expect(row).toMatchObject({ lemma: '', dictId: null });
    expect(row.cells['indefSg']?.mode).toBe('prefill');
    expect(row.cells['defPl']?.mode).toBe('ask');
  });

  it('removes a row', () => {
    expect(removeRow(sampleContent(), 'r2').rows.map((r) => r.id)).toEqual(['r1', 'r3', 'r4']);
  });
});

describe('IT-B9: given and asked', () => {
  it('per cell', () => {
    expect(
      setCellMode(sampleContent(), 'r1', 'defSg', 'prefill').rows[0]?.cells['defSg']?.mode,
    ).toBe('prefill');
  });

  it('«Open everything» and «First column given»', () => {
    const open = bulkOpenAll(sampleContent());
    expect(open.rows.every((r) => Object.values(r.cells).every((c) => c.mode === 'ask'))).toBe(
      true,
    );
    const first = bulkFirstGiven(open);
    expect(
      first.rows.every(
        (r) => r.cells['indefSg']?.mode === 'prefill' && r.cells['defSg']?.mode === 'ask',
      ),
    ).toBe(true);
  });

  it('«First column given» means the first slot in play', () => {
    const ex = bulkFirstGiven(bulkOpenAll(toggleSlot(sampleContent(), 'indefSg')));
    expect(ex.rows[0]?.cells['defSg']?.mode).toBe('prefill');
  });
});

describe('variants', () => {
  it('trimmed, never doubled, never the key', () => {
    let ex = addAccept(sampleContent(), 'r1', 'defSg', '  jobba ');
    ex = addAccept(ex, 'r1', 'defSg', 'Jobba');
    ex = addAccept(ex, 'r1', 'defSg', 'jobben');
    ex = addAccept(ex, 'r1', 'defSg', '  ');
    expect(ex.rows[0]?.cells['defSg']?.accept).toEqual(['jobba']);
    expect(removeAccept(ex, 'r1', 'defSg', 0).rows[0]?.cells['defSg']?.accept).toEqual([]);
  });
});

describe('dials', () => {
  it('are clamped to the sliders', () => {
    const ex = updateSettings(updateInput(sampleContent(), { bankExtra: 9 }), {
      attempts: 0,
      threshold: 20,
    });
    expect(ex.input.bankExtra).toBe(5);
    expect(ex.settings).toMatchObject({ attempts: 1, threshold: 50 });
  });
});
