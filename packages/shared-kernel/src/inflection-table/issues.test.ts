// Every issue fires on its own broken model and stays quiet on the neighbouring one (plan 69 §4.3).

import { describe, expect, it } from 'vitest';

import {
  addManualRow,
  pickParadigm,
  setCellMode,
  setCellValue,
  setLemma,
  setWhy,
  toggleSlot,
  updateInput,
  updateSettings,
} from './edits.js';
import { sampleContent } from './fixture.js';
import { issues, isReady, stepState } from './issues.js';
import { emptyContent } from './model.js';

const codes = (ex: Parameters<typeof issues>[0]) => issues(ex).map((i) => i.code);

describe('the sample', () => {
  it('is ready and quiet', () => {
    expect(isReady(sampleContent())).toBe(true);
    expect(codes(sampleContent())).toEqual([]);
  });
});

describe('blockers', () => {
  it('IT_NO_PACK — and nothing else is said without columns', () => {
    expect(codes(emptyContent('uk'))).toEqual(['IT_NO_PACK']);
  });

  it('IT_TOO_FEW_SLOTS', () => {
    const ex = toggleSlot(toggleSlot(toggleSlot(sampleContent(), 'defSg'), 'indefPl'), 'defPl');
    expect(codes(ex)).toContain('IT_TOO_FEW_SLOTS');
    expect(codes(toggleSlot(toggleSlot(sampleContent(), 'defSg'), 'indefPl'))).not.toContain(
      'IT_TOO_FEW_SLOTS',
    );
  });

  it('IT_NO_ROWS on an empty table, not once a row exists', () => {
    expect(codes(emptyContent('nb'))).toEqual(['IT_NO_ROWS']);
    expect(codes(addManualRow(emptyContent('nb')))).not.toContain('IT_NO_ROWS');
  });

  it('IT_NOTHING_ASKED when every cell is given', () => {
    let ex = sampleContent();
    for (const row of ex.rows)
      for (const slot of ex.slots) ex = setCellMode(ex, row.id, slot, 'prefill');
    expect(codes(ex)).toContain('IT_NOTHING_ASKED');
    expect(codes(ex)).toContain('IT_ROW_ALL_GIVEN');
  });

  it('IT_ROW_NO_LEMMA names the row', () => {
    expect(issues(setLemma(sampleContent(), 'r3', ' '))).toContainEqual(
      expect.objectContaining({ code: 'IT_ROW_NO_LEMMA', rowId: 'r3' }),
    );
  });

  it('IT-B8: a cell without a key, and a key without a reason, are blockers — one each', () => {
    const noKey = setCellValue(sampleContent(), 'r2', 'defSg', '');
    expect(issues(noKey)).toContainEqual(
      expect.objectContaining({
        code: 'IT_CELL_NO_KEY',
        rowId: 'r2',
        slotId: 'defSg',
        level: 'blocker',
      }),
    );
    // No key, so no reason is owed yet: one problem at a time.
    expect(codes(noKey)).not.toContain('IT_CELL_NO_WHY');

    const noWhy = setWhy(sampleContent(), 'r2', 'defSg', '');
    expect(issues(noWhy)).toContainEqual(
      expect.objectContaining({
        code: 'IT_CELL_NO_WHY',
        rowId: 'r2',
        slotId: 'defSg',
        level: 'blocker',
        step: 3,
      }),
    );
  });

  it('a given cell owes no key and no reason', () => {
    const ex = setCellValue(
      setCellMode(sampleContent(), 'r2', 'defSg', 'prefill'),
      'r2',
      'defSg',
      'boka',
    );
    expect(isReady(setWhy(ex, 'r2', 'defSg', ''))).toBe(true);
  });
});

describe('warnings and info', () => {
  it('IT_FEW_ROWS and IT_MANY_ROWS', () => {
    const two = { ...sampleContent(), rows: sampleContent().rows.slice(0, 2) };
    expect(codes(two)).toContain('IT_FEW_ROWS');
    expect(codes(sampleContent())).not.toContain('IT_FEW_ROWS');
    let many = sampleContent();
    for (let i = 0; i < 3; i += 1) many = addManualRow(many);
    expect(codes(many)).toContain('IT_MANY_ROWS');
  });

  it('IT_SLOT_NEVER_ASKED', () => {
    let ex = sampleContent();
    for (const row of ex.rows) ex = setCellMode(ex, row.id, 'defPl', 'prefill');
    expect(issues(ex)).toContainEqual(
      expect.objectContaining({ code: 'IT_SLOT_NEVER_ASKED', slotId: 'defPl' }),
    );
  });

  it('the given first column is the cue, not decoration', () => {
    expect(codes(sampleContent())).not.toContain('IT_SLOT_NEVER_ASKED');
  });

  it('IT_DUPLICATE_LEMMA names the second occurrence', () => {
    const ex = setLemma(sampleContent(), 'r3', 'Ei  bok');
    expect(issues(ex)).toContainEqual(
      expect.objectContaining({ code: 'IT_DUPLICATE_LEMMA', rowId: 'r3' }),
    );
  });

  it('IT_ROW_NOT_LINKED is info, not a warning (DECISIONS §2)', () => {
    const ex = addManualRow(sampleContent());
    expect(issues(ex)).toContainEqual(
      expect.objectContaining({ code: 'IT_ROW_NOT_LINKED', level: 'info' }),
    );
  });

  it('bank warnings only in bank mode', () => {
    expect(codes(updateInput(sampleContent(), { bankExtra: 0 }))).not.toContain('IT_BANK_NO_EXTRA');
    expect(codes(updateInput(sampleContent(), { mode: 'bank', bankExtra: 0 }))).toContain(
      'IT_BANK_NO_EXTRA',
    );
    expect(codes(updateInput(sampleContent(), { mode: 'bank', bankExtra: 3 }))).toEqual([]);
  });

  it('IT_BANK_TOO_BIG past a dozen asked cells', () => {
    let ex = updateInput(sampleContent(), { mode: 'bank' });
    ex = setCellMode(ex, 'r1', 'indefSg', 'ask');
    expect(codes(ex)).toContain('IT_BANK_TOO_BIG');
  });

  it('IT_KEY_NEVER_SHOWN', () => {
    expect(codes(updateSettings(sampleContent(), { revealKey: 'never' }))).toEqual([
      'IT_KEY_NEVER_SHOWN',
    ]);
  });

  it('IT_SLOT_GONE when the document keeps a slot the pack dropped', () => {
    const ex = { ...sampleContent(), slots: ['indefSg', 'defSg', 'indefPl', 'defPl', 'vocative'] };
    expect(issues(ex)).toContainEqual(
      expect.objectContaining({ code: 'IT_SLOT_GONE', slotId: 'vocative' }),
    );
  });
});

describe('stepState', () => {
  it('a blank draft: step 2 red, step 3 empty, the rest ok', () => {
    const ex = emptyContent('nb');
    expect(stepState(ex, 1)).toEqual({ s: 'ok', errs: 0 });
    expect(stepState(ex, 2)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 3)).toEqual({ s: 'empty', errs: 0 });
    expect(stepState(ex, 4)).toEqual({ s: 'ok', errs: 0 });
  });

  it('warnings colour the dot, info does not', () => {
    expect(stepState(addManualRow(pickParadigm(sampleContent(), 'verb')), 2).s).toBe('err');
    expect(stepState(updateSettings(sampleContent(), { revealKey: 'never' }), 4).s).toBe('ok');
    expect(stepState(updateInput(sampleContent(), { mode: 'bank', bankExtra: 0 }), 4).s).toBe(
      'warn',
    );
  });
});
