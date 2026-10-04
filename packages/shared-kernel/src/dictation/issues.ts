// The validation engine for `dictation` — SPEC_api_contract §1.
//
// One list drives the rail dots, the inline messages, the gate and the content-service
// publish preflight (AC-X1). Issues carry a code and the parameters a message needs, never
// the message — the teacher UI is in four languages. Every issue about one sentence names it
// by id; the prototype counted («2 segments are empty»), which cannot be drawn on the row it
// belongs to (plan 68 §5, deviation 11).
//
// ── The audio layer's share (decision Q3-A of plan 68) ──────────────────────
// The handoff lists its own codes for the clip, but four of them are the audio layer's
// rules under another name, and plan 56 allows one `audioIssues`. So:
//
//   DICT_NO_CLIP            → AUD_NO_CLIP        (the layer's)
//   DICT_CLIP_UNTITLED      → AUD_NO_TITLE       (the layer's)
//   DICT_TIMECODE_INVERTED  → AUD_SEG_INVERTED   (the layer's)
//   DICT_TIMECODE_PAST_END  → AUD_SEG_BEYOND     (the layer's)
//
// and two of the layer's are silenced for this type (`audioIssuesOf`): `AUD_NO_TRANSCRIPT`,
// because the transcript is the key itself and is never written as a separate text; and
// `AUD_ONE_PLAY_MANY_ITEMS`, replaced by `DICT_ONE_PLAY_MANY_SEGMENTS` with the handoff's
// stricter ceiling (more than two sentences on one playback, not four).
//
// Two informational notes in the prototype have no code in the handoff's closed list and are
// not built (plan 68 §4.2, 8).

import type { AudioIssue, AudioItem } from '../audio/issues.js';
import { audioIssues } from '../audio/issues.js';
import { focusCoverage, readySegments } from './derive.js';
import type { DictationContent } from './model.js';
import {
  DC_CLIP_LONG,
  DC_MAX_SEG,
  DC_ONE_PLAY_CROWDED,
  DC_SEG_LONG,
  DC_SEG_SHORT,
} from './model.js';
import { wordCount } from './tokens.js';

export type IssueLevel = 'blocker' | 'warning';

/** Which builder step owns the fix. */
export type IssueStep = 1 | 2 | 3 | 4;

export type Issue =
  // ── Step 1 — the recording ──
  | { code: 'DICT_NO_TITLE'; level: 'blocker'; step: 1 }
  | { code: 'DICT_CLIP_TOO_LONG'; level: 'warning'; step: 1; seconds: number }
  // ── Step 2 — the key ──
  | { code: 'DICT_NO_KEY'; level: 'blocker'; step: 2 }
  | { code: 'DICT_EMPTY_SEGMENT'; level: 'blocker'; step: 2; segmentId: string }
  | { code: 'DICT_SEGMENT_TOO_LONG'; level: 'warning'; step: 2; segmentId: string; words: number }
  | { code: 'DICT_SEGMENT_TOO_SHORT'; level: 'warning'; step: 2; segmentId: string; words: number }
  | { code: 'DICT_TIMECODE_MISSING'; level: 'warning'; step: 2; segmentId: string }
  | { code: 'DICT_DUPLICATE_SEGMENT'; level: 'warning'; step: 2; segmentId: string }
  | { code: 'DICT_TOO_MANY_SEGMENTS'; level: 'warning'; step: 2; count: number }
  // ── Step 3 — marking and feedback ──
  | { code: 'DICT_NO_WHY'; level: 'blocker'; step: 3; segmentId: string }
  | { code: 'DICT_NO_FOCUS'; level: 'warning'; step: 3 }
  | {
      code: 'DICT_FOCUS_WITHOUT_REASON';
      level: 'warning';
      step: 3;
      segmentId: string;
      focusId: string;
    }
  // ── Step 4 — difficulty and delivery ──
  | { code: 'DICT_TRANSCRIPT_ALWAYS'; level: 'blocker'; step: 4 }
  | { code: 'DICT_ONE_PLAY_MANY_SEGMENTS'; level: 'warning'; step: 4; count: number }
  | { code: 'DICT_NO_RETRY_NO_KEY'; level: 'warning'; step: 4 };

export type IssueCode = Issue['code'];

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(ex: DictationContent): Issue[] {
  const out: Issue[] = [];
  const ready = readySegments(ex);

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (ex.title.trim() === '') out.push({ code: 'DICT_NO_TITLE', level: 'blocker', step: 1 });
  if (ex.audio.duration > DC_CLIP_LONG) {
    out.push({ code: 'DICT_CLIP_TOO_LONG', level: 'warning', step: 1, seconds: ex.audio.duration });
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  if (ready.length === 0) {
    out.push({ code: 'DICT_NO_KEY', level: 'blocker', step: 2 });
  } else {
    for (const s of ex.segments) {
      if (s.text.trim() === '')
        out.push({ code: 'DICT_EMPTY_SEGMENT', level: 'blocker', step: 2, segmentId: s.id });
    }
  }
  const seen = new Set<string>();
  for (const s of ready) {
    const words = wordCount(s.text);
    if (words > DC_SEG_LONG)
      out.push({
        code: 'DICT_SEGMENT_TOO_LONG',
        level: 'warning',
        step: 2,
        segmentId: s.id,
        words,
      });
    if (words < DC_SEG_SHORT)
      out.push({
        code: 'DICT_SEGMENT_TOO_SHORT',
        level: 'warning',
        step: 2,
        segmentId: s.id,
        words,
      });
    // Only where a replay of one sentence is on offer: sentence by sentence, fragments on,
    // more than one sentence. Inverted and past-the-end timecodes are the audio layer's.
    if (
      ex.mode === 'segments' &&
      ex.audio.useSegments &&
      ex.segments.length > 1 &&
      s.audio === null
    ) {
      out.push({ code: 'DICT_TIMECODE_MISSING', level: 'warning', step: 2, segmentId: s.id });
    }
    // The second occurrence is flagged — the one the author most likely meant to change.
    const key = s.text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key))
      out.push({ code: 'DICT_DUPLICATE_SEGMENT', level: 'warning', step: 2, segmentId: s.id });
    seen.add(key);
  }
  if (ex.segments.length > DC_MAX_SEG) {
    out.push({
      code: 'DICT_TOO_MANY_SEGMENTS',
      level: 'warning',
      step: 2,
      count: ex.segments.length,
    });
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  for (const s of ready) {
    if (s.why.trim() === '')
      out.push({ code: 'DICT_NO_WHY', level: 'blocker', step: 3, segmentId: s.id });
  }
  const coverage = focusCoverage(ex);
  if (ready.length > 0 && coverage.total === 0)
    out.push({ code: 'DICT_NO_FOCUS', level: 'warning', step: 3 });
  for (const s of ready) {
    for (const f of s.focus) {
      if (f.why.trim() === '') {
        out.push({
          code: 'DICT_FOCUS_WITHOUT_REASON',
          level: 'warning',
          step: 3,
          segmentId: s.id,
          focusId: f.id,
        });
      }
    }
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  if (ex.audio.settings.transcriptWhen === 'always')
    out.push({ code: 'DICT_TRANSCRIPT_ALWAYS', level: 'blocker', step: 4 });
  if (ex.audio.settings.plays === 1 && ready.length > DC_ONE_PLAY_CROWDED) {
    out.push({
      code: 'DICT_ONE_PLAY_MANY_SEGMENTS',
      level: 'warning',
      step: 4,
      count: ready.length,
    });
  }
  if (ex.settings.attempts === 1 && !ex.settings.revealKey)
    out.push({ code: 'DICT_NO_RETRY_NO_KEY', level: 'warning', step: 4 });

  return out;
}

/** The audio layer's codes this type silences — see the header. */
export const SILENCED_AUDIO_CODES: readonly AudioIssue['code'][] = [
  'AUD_NO_TRANSCRIPT',
  'AUD_ONE_PLAY_MANY_ITEMS',
];

/** Whether an audio-layer issue applies to a dictation. Read by the builder and the preflight. */
export function keepsAudioIssue(issue: { code: string }): boolean {
  return !(SILENCED_AUDIO_CODES as readonly string[]).includes(issue.code);
}

/** The segments as the audio layer sees its items: an id and a timecode. */
export function audioItems(ex: DictationContent): AudioItem[] {
  return ex.segments.map((s) => (s.audio === null ? { id: s.id } : { id: s.id, audio: s.audio }));
}

/**
 * The audio layer's findings for this document, minus the two it silences. `content` is the
 * persisted `content` column (or anything carrying the `audio` block the layer reads).
 */
export function audioIssuesOf(ex: DictationContent): AudioIssue[] {
  return audioIssues({ audio: ex.audio }, audioItems(ex)).filter(keepsAudioIssue);
}

/** Whether the exercise may be published — the type's blockers and the layer's. */
export function isReady(ex: DictationContent): boolean {
  return (
    !issues(ex).some((i) => i.level === 'blocker') &&
    !audioIssuesOf(ex).some((i) => i.level === 'blocker')
  );
}

export function blockers(ex: DictationContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'blocker');
}

export function warnings(ex: DictationContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'warning');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * The rail dot for a step, from the type's own issues — the builder folds the audio layer's
 * in on top (`foldAudioIntoStep`), as every audio-capable builder does. Blockers first, so a
 * blank draft shows counts on steps 1 and 2 (AC-B1). Step 3 has nothing to judge until a
 * sentence is written: `empty` then.
 */
export function stepState(ex: DictationContent, step: IssueStep): StepState {
  const own = issues(ex).filter((i) => i.step === step);
  const errs = own.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (own.length > 0) return { s: 'warn', errs: 0 };
  if ((step === 2 || step === 3) && readySegments(ex).length === 0) return { s: 'empty', errs: 0 };
  return { s: 'ok', errs: 0 };
}
