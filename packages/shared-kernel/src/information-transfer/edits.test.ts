// The builder's edits (plan 73 §4.1).

import { describe, expect, it } from 'vitest';

import {
  addField,
  moveField,
  removeExpected,
  removeField,
  setExpected,
  setScoring,
  setSourceKind,
} from './edits.js';
import { SAMPLE_FIELD_IDS, sampleContent } from './fixture.js';
import { emptyContent } from './model.js';

describe('edits', () => {
  it('the last field cannot go', () => {
    const ex = emptyContent('nb');
    expect(removeField(ex, ex.fields[0]!.id)).toBe(ex);
    expect(removeField(sampleContent(), SAMPLE_FIELD_IDS[0]).fields).toHaveLength(5);
  });

  it('moves a field and keeps its id — reordering never moves an explanation', () => {
    const ex = moveField(sampleContent(), 0, 1);
    expect(ex.fields.map((f) => f.id).slice(0, 2)).toEqual([SAMPLE_FIELD_IDS[1], SAMPLE_FIELD_IDS[0]]);
    expect(ex.fields[1]!.why).toMatch(/Datoen/);
    expect(moveField(sampleContent(), 0, -1)).toEqual(sampleContent());
    expect(moveField(sampleContent(), 5, 1)).toEqual(sampleContent());
  });

  it('a field from the scanner arrives typed and filled', () => {
    const f = addField(emptyContent('nb'), 'time', 'kl. 17.30').fields[1]!;
    expect(f).toMatchObject({ type: 'time', expected: ['kl. 17.30'], label: '', why: '', required: true });
  });

  it('expected wordings behave like the prototype’s list', () => {
    const id = SAMPLE_FIELD_IDS[5];
    let ex = sampleContent();
    ex = setExpected(ex, id, 2, 'A. L. Berg');
    expect(ex.fields[5]!.expected).toEqual(['Anne Lise Berg', 'Anne Lise', 'A. L. Berg']);
    ex = setExpected(ex, id, 2, '');
    expect(ex.fields[5]!.expected).toEqual(['Anne Lise Berg', 'Anne Lise']);
    ex = removeExpected(ex, id, 1);
    expect(ex.fields[5]!.expected).toEqual(['Anne Lise Berg']);
  });

  it('switching to the recording turns the audio block on', () => {
    const ex = setSourceKind(emptyContent('nb'), 'audio');
    expect(ex.audio.enabled).toBe(true);
    expect(setSourceKind(ex, 'text').sourceKind).toBe('text');
  });

  it('clamps the pass mark', () => {
    expect(setScoring(sampleContent(), { passPct: 140 }).scoring.passPct).toBe(100);
    expect(setScoring(sampleContent(), { passPct: -5 }).scoring.passPct).toBe(0);
  });
});
