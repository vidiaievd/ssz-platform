import { describe, expect, it } from 'vitest';

import {
  addSegment,
  applySplit,
  canPutBack,
  previewJoin,
  putBack,
  removeSegment,
  setMode,
  setSegmentAudio,
  setSegmentText,
  toggleFocus,
} from './edits.js';
import { sample } from './fixtures.test-support.js';
import { DC_MAX_SEG, emptyContent } from './model.js';
import { packOf } from './presets.js';

describe('edits', () => {
  it('AC-B6: clicking a word makes it a focus word with an empty reason; again unmarks it', () => {
    const on = toggleFocus(sample(), 'b', 2);
    expect(on.segments[1]?.focus).toMatchObject([{ wordIndex: 2, why: '' }]);
    expect(toggleFocus(on, 'b', 2).segments[1]?.focus).toEqual([]);
  });

  it('ignores a click outside the sentence', () => {
    expect(toggleFocus(sample(), 'b', 99)).toEqual(sample());
  });

  it('AC-B7: an edit that loses a focus word files it as an orphan; putting it back restores it', () => {
    const edited = setSegmentText(sample(), 'a', 'På badet står det en skje.');
    expect(edited.orphans).toMatchObject([{ id: 'f1', surface: 'kjøkkenet', why: 'kj- foran ø.' }]);
    expect(canPutBack(edited, 'f1')).toBe(false);
    const back = setSegmentText(edited, 'a', 'På kjøkkenet står det en skje.');
    expect(canPutBack(back, 'f1')).toBe(true);
    const restored = putBack(back, 'f1');
    expect(restored.orphans).toEqual([]);
    expect(restored.segments[0]?.focus).toEqual([{ id: 'f1', wordIndex: 1, why: 'kj- foran ø.' }]);
  });

  it('stops at eight segments', () => {
    let ex = emptyContent('nb');
    for (let k = 0; k < 20; k++) ex = addSegment(ex);
    expect(ex.segments).toHaveLength(DC_MAX_SEG);
  });

  it('starts a new segment where the last timed one ends (plan 68 §4.1)', () => {
    const timed = setSegmentAudio(sample(), 'b', { start: 12, end: 26 });
    const added = addSegment(timed);
    expect(added.segments.at(-1)!.audio).toEqual({ start: 26, end: 26 });
  });

  it('gives a segment no timecode after an untimed or inverted one', () => {
    expect(addSegment(setSegmentAudio(sample(), 'b', null)).segments.at(-1)!.audio).toBeNull();
    const inverted = setSegmentAudio(sample(), 'b', { start: 9, end: 4 });
    expect(addSegment(inverted).segments.at(-1)!.audio).toBeNull();
  });

  it('removes a segment with its orphans, never the last one', () => {
    const edited = setSegmentText(sample(), 'a', 'På badet står det en skje.');
    const gone = removeSegment(edited, 'a');
    expect(gone.segments.map((s) => s.id)).toEqual(['b']);
    expect(gone.orphans).toEqual([]);
    expect(removeSegment(gone, 'b')).toBe(gone);
  });

  it('AC-B10: joining is shown first and keeps every focus word on its word', () => {
    const ex = toggleFocus(sample(), 'b', 1); // «hadde»
    expect(previewJoin(ex)).toMatchObject({
      text: 'På kjøkkenet står det en skje. Vi hadde ikke hørt noe i går.',
      focus: 2,
    });
    const whole = setMode(ex, 'whole');
    expect(whole.segments).toHaveLength(1);
    expect(whole.segments[0]?.audio).toBeNull();
    expect(whole.audio.useSegments).toBe(false);
    expect(whole.segments[0]?.focus.map((f) => f.wordIndex)).toEqual([1, 7]);
    expect(whole.segments[0]?.why).toBe('A rule the ear missed. A rule the ear missed.');
  });

  it('back to sentence by sentence turns fragments on again', () => {
    const back = setMode(setMode(sample(), 'whole'), 'segments');
    expect(back.mode).toBe('segments');
    expect(back.audio.useSegments).toBe(true);
  });

  it('paste and split replaces the key and reports the estimates', () => {
    const { ex, estimated } = applySplit(emptyContent('nb'), 'En to tre. Fire fem.', packOf('nb'));
    expect(ex.segments.map((s) => s.text)).toEqual(['En to tre.', 'Fire fem.']);
    expect(estimated).toEqual([]);
  });
});
