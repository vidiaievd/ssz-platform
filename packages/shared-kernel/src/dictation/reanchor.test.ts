// SPEC_data_model §5, AC-B7.

import { describe, expect, it } from 'vitest';

import { seg } from './fixtures.test-support.js';
import { previewReanchor, putBackIndex, reanchorFocus } from './reanchor.js';

const kj = (text = 'På kjøkkenet står det en skje.') =>
  seg(text, {
    id: 'a',
    focus: [
      { id: 'f1', wordIndex: 1, why: 'kj- foran ø.' },
      { id: 'f2', wordIndex: 5, why: 'skj-.' },
    ],
  });

describe('reanchorFocus', () => {
  it('an edit elsewhere leaves a focus word on its word', () => {
    const r = reanchorFocus(kj(), 'På kjøkkenet står det nå en skje.');
    expect(r.focus.map((f) => f.wordIndex)).toEqual([1, 6]);
    expect(r.orphans).toEqual([]);
  });

  it('inserting the same word in front shifts, not steals (Q7-A precedent)', () => {
    // Surface + ordinal alone would move the mark to the inserted «det» (the second one).
    const s = seg('Det samme er det.', { focus: [{ id: 'f', wordIndex: 3, why: '' }] });
    const r = reanchorFocus(s, 'Det det samme er det.');
    expect(r.focus[0]?.wordIndex).toBe(4);
  });

  it('a capital is not a different word', () => {
    expect(
      reanchorFocus(kj(), 'Kjøkkenet står det en skje på.').orphans.map((o) => o.surface),
    ).toEqual([]);
  });

  it('AC-B7: a vanished word becomes an orphan with its surface and its reason', () => {
    const r = reanchorFocus(kj(), 'På badet står det en skje.');
    expect(r.orphans).toEqual([
      { id: 'f1', segmentId: 'a', surface: 'kjøkkenet', why: 'kj- foran ø.' },
    ]);
    expect(r.focus.map((f) => f.id)).toEqual(['f2']);
  });

  it('the preview counts exactly what applying orphans', () => {
    expect(previewReanchor(kj(), 'På badet står det en gaffel.')).toBe(2);
  });
});

describe('putBackIndex', () => {
  it('finds the first free occurrence', () => {
    const s = seg('skje og skje', { focus: [{ id: 'x', wordIndex: 0, why: '' }] });
    expect(putBackIndex(s, { id: 'o', segmentId: s.id, surface: 'skje', why: '' })).toBe(2);
  });

  it('null when the word is gone', () => {
    expect(
      putBackIndex(seg('ingenting her'), { id: 'o', segmentId: 's', surface: 'skje', why: '' }),
    ).toBeNull();
  });
});
