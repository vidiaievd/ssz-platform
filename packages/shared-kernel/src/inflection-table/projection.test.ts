// What reaches the student (IT-M1, IT-X2) and the storage split it rests on.

import { describe, expect, it } from 'vitest';

import { shuffled } from '../sort-into-buckets/shuffle.js';
import { setCellValue, setLemma, updateInput, updateSettings } from './edits.js';
import { sampleContent } from './fixture.js';
import { emptyContent } from './model.js';
import { fromPersisted, toContent, toExpectedAnswers } from './persistence.js';
import { toStudentProjection, withGradedSettings } from './projection.js';

const project = (ex = sampleContent(), seed?: number) =>
  toStudentProjection(
    toContent(ex),
    toExpectedAnswers(ex),
    seed === undefined ? undefined : (items) => shuffled(items, seed),
  );

describe('persistence', () => {
  it('round-trips the document', () => {
    const ex = sampleContent();
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });

  it('IT-M1: content never holds the form, variants or reason of an asked cell', () => {
    const json = JSON.stringify(toContent(sampleContent()));
    for (const word of ['jobben', 'bøkene', 'søsteren', 'Omlyd']) expect(json).not.toContain(word);
    expect(toContent(sampleContent()).rows[1]?.cells['indefSg']).toEqual({
      mode: 'prefill',
      value: 'bok',
    });
  });

  it('keeps the reason of a cell switched to given', () => {
    const ex = sampleContent();
    ex.rows[1]!.cells['defSg']!.mode = 'prefill';
    expect(
      fromPersisted(toContent(ex), toExpectedAnswers(ex)).rows[1]?.cells['defSg']?.why,
    ).toContain('Hunkjønn');
  });

  it('reads garbage without throwing', () => {
    expect(fromPersisted(null, 'x')).toMatchObject({
      rows: [],
      slots: [],
      input: { mode: 'type' },
    });
    expect(
      fromPersisted({ settings: { attempts: 9, threshold: 5, revealKey: 'soon' } }, {}).settings,
    ).toMatchObject({
      attempts: 4,
      threshold: 50,
      revealKey: 'afterLast',
    });
  });
});

describe('the projection', () => {
  it('IT-X2: an asked cell is exactly its mode; the root carries no key, reason or pass mark', () => {
    const p = project();
    for (const row of p.rows) {
      expect(Object.keys(row).sort()).toEqual(['cells', 'gloss', 'id', 'lemma']);
      for (const cell of Object.values(row.cells)) {
        expect(Object.keys(cell)).toEqual(cell.mode === 'ask' ? ['mode'] : ['mode', 'value']);
      }
    }
    expect(Object.keys(p).sort()).toEqual([
      'instruction',
      'language',
      'paradigm',
      'rows',
      'settings',
      'slots',
    ]);
    expect(Object.keys(p.settings).sort()).toEqual([
      'attempts',
      'input',
      'revealKey',
      'rowVerdict',
    ]);
    const json = JSON.stringify(p);
    for (const word of ['jobben', 'boken', 'Omlyd', 'dict-r1', '2.4', 'threshold'])
      expect(json).not.toContain(word);
  });

  it('resolves slot headings from the pack', () => {
    expect(project().slots[1]).toEqual({
      id: 'defSg',
      label: 'Bestemt entall',
      short: 'best. ent.',
    });
    expect(project().paradigm).toEqual({
      id: 'noun',
      label: 'Substantiv',
      lemmaLabel: 'Ordbokform',
    });
  });

  it('the first letter only under the hint', () => {
    expect(project().rows[1]?.cells['indefPl']).toEqual({ mode: 'ask' });
    const hinted = project(updateSettings(sampleContent(), { hintFirstLetter: true }));
    expect(hinted.rows[1]?.cells['indefPl']).toEqual({ mode: 'ask', hint: 'b' });
  });

  it('drops a row without a lemma and an asked cell without a key', () => {
    const ex = setCellValue(setLemma(sampleContent(), 'r3', ''), 'r1', 'defSg', '');
    const p = project(ex);
    expect(p.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r4']);
    expect(p.rows[0]?.cells['defSg']).toBeUndefined();
  });

  it('the bank only in bank mode — every key once, plus the distractors, dealt', () => {
    expect(project().bank).toBeUndefined();
    const ex = updateInput(sampleContent(), { mode: 'bank', bankExtra: 2 });
    const plain = project(ex).bank ?? [];
    expect(plain).toHaveLength(14);
    expect(project(ex, 7).bank?.slice().sort()).toEqual(plain.slice().sort());
    expect(project(ex, 7).bank).not.toEqual(plain);
  });

  it('IT-R8: rows dealt per attempt only under shuffleRows', () => {
    const order = (seed: number, shuffleRows: boolean) =>
      project(updateInput(sampleContent(), { shuffleRows }), seed).rows.map((r) => r.id);
    expect(order(3, false)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(order(3, true)).toEqual(order(3, true));
    expect(
      [order(3, true), order(11, true), order(42, true)].some((o) => o.join() !== 'r1,r2,r3,r4'),
    ).toBe(true);
  });

  it('a graded delivery: one check, no key, no hint', () => {
    const hinted = project(updateSettings(sampleContent(), { hintFirstLetter: true, attempts: 3 }));
    const graded = withGradedSettings(hinted) as typeof hinted;
    expect(graded.settings).toMatchObject({ attempts: 1, revealKey: 'never' });
    expect(graded.rows[1]?.cells['indefPl']).toEqual({ mode: 'ask' });
  });

  it('IT-X1: a blank document writes no Norwegian', () => {
    const blank = JSON.stringify(emptyContent(''));
    expect(blank).not.toMatch(/[æøå]|bøy|Substantiv/i);
    expect(emptyContent('nb').instruction).toBe('');
  });
});
