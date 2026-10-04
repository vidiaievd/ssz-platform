// Pure edits of a `dictation` document — the builder's reducers.
//
// Every cascade the handoff names lives here so the web builder stays a thin wrapper and a
// test can pin each one: re-anchoring focus words on a text edit (reanchor.ts), dropping a
// segment's focus words and orphans with it, the segment ceiling, joining into one text.

import type { ItemAudio } from '../audio/model.js';
import type { DictationContent, Marking, Mode, Segment, Settings } from './model.js';
import { DC_MAX_SEG, newId, newSegment } from './model.js';
import type { LanguagePack } from './presets.js';
import { putBackIndex, reanchorFocus } from './reanchor.js';
import type { SplitResult } from './split.js';
import { splitTranscript } from './split.js';
import { tokens } from './tokens.js';

export function update(ex: DictationContent, patch: Partial<DictationContent>): DictationContent {
  return { ...ex, ...patch };
}

export function updateMarking(ex: DictationContent, patch: Partial<Marking>): DictationContent {
  return { ...ex, marking: { ...ex.marking, ...patch } };
}

export function updateSettings(ex: DictationContent, patch: Partial<Settings>): DictationContent {
  return { ...ex, settings: { ...ex.settings, ...patch } };
}

function mapSegment(
  ex: DictationContent,
  id: string,
  fn: (s: Segment) => Segment,
): DictationContent {
  return { ...ex, segments: ex.segments.map((s) => (s.id === id ? fn(s) : s)) };
}

/** Edit a sentence. Its focus words follow their words; the ones that cannot become orphans. */
export function setSegmentText(ex: DictationContent, id: string, text: string): DictationContent {
  const seg = ex.segments.find((s) => s.id === id);
  if (!seg) return ex;
  const { focus, orphans } = reanchorFocus(seg, text);
  return {
    ...mapSegment(ex, id, (s) => ({ ...s, text, focus })),
    orphans: [...ex.orphans, ...orphans],
  };
}

export function setSegmentWhy(ex: DictationContent, id: string, why: string): DictationContent {
  return mapSegment(ex, id, (s) => ({ ...s, why }));
}

export function setSegmentAudio(
  ex: DictationContent,
  id: string,
  audio: ItemAudio | null,
): DictationContent {
  return mapSegment(ex, id, (s) => ({ ...s, audio }));
}

export function canAddSegment(ex: DictationContent): boolean {
  return ex.mode === 'segments' && ex.segments.length < DC_MAX_SEG;
}

/**
 * Append an empty sentence. Sentences follow one another in the clip, so when the last one is
 * timed the new one starts where it ends (plan 68 §4.1, the prototype's `add`): the author
 * only has to set an end. The pair is empty until they do, which the audio layer says in
 * words (`AUD_SEG_INVERTED`) — a warning, never a blocker. After an untimed sentence there is
 * nothing to follow, and the new one has no timecode.
 */
export function addSegment(ex: DictationContent): DictationContent {
  if (!canAddSegment(ex)) return ex;
  const last = ex.segments.at(-1);
  const next = newSegment();
  if (last?.audio != null && last.audio.end > last.audio.start) {
    next.audio = { start: last.audio.end, end: last.audio.end };
  }
  return { ...ex, segments: [...ex.segments, next] };
}

/** Delete a sentence with its focus words, its reason and its orphans. Never the last one. */
export function removeSegment(ex: DictationContent, id: string): DictationContent {
  if (ex.segments.length <= 1) return ex;
  return {
    ...ex,
    segments: ex.segments.filter((s) => s.id !== id),
    orphans: ex.orphans.filter((o) => o.segmentId !== id),
  };
}

/** Click a word in step 3: mark it as a focus word with an empty reason, or unmark it. */
export function toggleFocus(
  ex: DictationContent,
  segmentId: string,
  wordIndex: number,
): DictationContent {
  return mapSegment(ex, segmentId, (s) => {
    if (wordIndex < 0 || wordIndex >= tokens(s.text).length) return s;
    const has = s.focus.some((f) => f.wordIndex === wordIndex);
    const focus = has
      ? s.focus.filter((f) => f.wordIndex !== wordIndex)
      : [...s.focus, { id: newId(), wordIndex, why: '' }].sort((a, b) => a.wordIndex - b.wordIndex);
    return { ...s, focus };
  });
}

export function setFocusWhy(
  ex: DictationContent,
  segmentId: string,
  focusId: string,
  why: string,
): DictationContent {
  return mapSegment(ex, segmentId, (s) => ({
    ...s,
    focus: s.focus.map((f) => (f.id === focusId ? { ...f, why } : f)),
  }));
}

/** Whether an orphan's word is in its sentence again (and its sentence still exists). */
export function canPutBack(ex: DictationContent, orphanId: string): boolean {
  const orphan = ex.orphans.find((o) => o.id === orphanId);
  const seg = orphan && ex.segments.find((s) => s.id === orphan.segmentId);
  return !!orphan && !!seg && putBackIndex(seg, orphan) !== null;
}

/** Put an orphan back on the first free occurrence of its word, reason intact. */
export function putBack(ex: DictationContent, orphanId: string): DictationContent {
  const orphan = ex.orphans.find((o) => o.id === orphanId);
  const seg = orphan && ex.segments.find((s) => s.id === orphan.segmentId);
  if (!orphan || !seg) return ex;
  const wordIndex = putBackIndex(seg, orphan);
  if (wordIndex === null) return ex;
  return {
    ...mapSegment(ex, seg.id, (s) => ({
      ...s,
      focus: [...s.focus, { id: orphan.id, wordIndex, why: orphan.why }].sort(
        (a, b) => a.wordIndex - b.wordIndex,
      ),
    })),
    orphans: ex.orphans.filter((o) => o.id !== orphanId),
  };
}

export function dropOrphan(ex: DictationContent, orphanId: string): DictationContent {
  return { ...ex, orphans: ex.orphans.filter((o) => o.id !== orphanId) };
}

export interface JoinPreview {
  text: string;
  why: string;
  /** Focus words carried into the joined text — none is lost. */
  focus: number;
}

/**
 * What switching to «One continuous text» would produce — shown before it is applied
 * (AC-B10). The prototype applied it at once and threw the focus words away; here they move
 * with their words (plan 68 §4.2, 4).
 */
export function previewJoin(ex: DictationContent): JoinPreview {
  return {
    text: ex.segments
      .map((s) => s.text.trim())
      .filter((t) => t !== '')
      .join(' '),
    why: ex.segments
      .map((s) => s.why.trim())
      .filter((w) => w !== '')
      .join(' '),
    focus: ex.segments.reduce((n, s) => (s.text.trim() === '' ? n : n + s.focus.length), 0),
  };
}

/**
 * Change the shape. To `whole`: the segments join into one, each focus word shifted by the
 * words before its sentence, timecodes and per-item fragments dropped. To `segments`: the one
 * segment stays, fragments come back on.
 */
export function setMode(ex: DictationContent, mode: Mode): DictationContent {
  if (mode === ex.mode) return ex;
  if (mode === 'segments') {
    return { ...ex, mode, audio: { ...ex.audio, useSegments: true } };
  }

  const join = previewJoin(ex);
  const focus: Segment['focus'] = [];
  let offset = 0;
  for (const s of ex.segments) {
    if (s.text.trim() === '') continue;
    for (const f of s.focus) focus.push({ ...f, wordIndex: f.wordIndex + offset });
    offset += tokens(s.text).length;
  }
  const segment: Segment = {
    id: ex.segments[0]?.id ?? newId(),
    text: join.text,
    audio: null,
    why: join.why,
    focus,
  };
  return {
    ...ex,
    mode,
    audio: { ...ex.audio, useSegments: false },
    segments: [segment],
    // An orphan's sentence is now part of the one text: it can be put back there.
    orphans: ex.orphans.map((o) => ({ ...o, segmentId: segment.id })),
  };
}

/** *Paste and split* — only offered while the key is empty (BEHAVIOR §3). */
export function applySplit(
  ex: DictationContent,
  text: string,
  pack: LanguagePack,
): { ex: DictationContent; estimated: string[] } {
  const result: SplitResult = splitTranscript(text, ex.audio.duration, pack);
  if (result.segments.length === 0) return { ex, estimated: [] };
  return { ex: { ...ex, segments: result.segments, orphans: [] }, estimated: result.estimated };
}
