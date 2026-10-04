// Builders for the kernel's own tests. Not exported from the module.

import type { DictationContent, Segment } from './model.js';
import { emptyContent } from './model.js';

let seq = 0;
const id = (prefix: string): string => `${prefix}${++seq}`;

export function seg(text: string, patch: Partial<Segment> = {}): Segment {
  return { id: id('s'), text, audio: null, why: 'A rule the ear missed.', focus: [], ...patch };
}

/** A ready, valid document: titled, a clip, two timed sentences with reasons and a focus word. */
export function sample(patch: Partial<DictationContent> = {}): DictationContent {
  const base = emptyContent('nb', 'Hør og skriv.');
  return {
    ...base,
    title: 'Diktat',
    audio: { ...base.audio, assetId: 'asset-1', title: 'Klipp', duration: 20 },
    segments: [
      seg('På kjøkkenet står det en skje.', {
        id: 'a',
        audio: { start: 0, end: 7 },
        focus: [{ id: 'f1', wordIndex: 1, why: 'kj- foran ø.' }],
      }),
      seg('Vi hadde ikke hørt noe i går.', { id: 'b', audio: { start: 7, end: 14 } }),
    ],
    ...patch,
  };
}
