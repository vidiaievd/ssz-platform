// Everything wrong with the audio on an exercise — plan 56 §4, from README.md
// ("Validation").
//
// The rule this file exists to keep is the same one the nine per-type kernels keep, and
// INTEGRATION.md restates it for the audio layer: **one `audioIssues`.** The step rail,
// the inline message on a card, the pre-assign gate and the server's publish preflight
// are four filters over this one list. A type with an audio rule of its own — such as
// `error_correction`, where a transcript on screen hands the exercise away — appends it
// from its own validator instead of patching this one.
//
// Two things are carried rather than decided here:
//
//   - **the message**, because the authoring UI is localised into four languages and
//     English prose in shared logic could not be rendered (plan 53 §3.6);
//   - **the step number**, because the layer mounts on builders with four steps and on
//     builders with three. The host says which of its steps owns each part.

import type { ExerciseAudio } from './model.js';
import { audioOf, hasClip, segmentOf } from './model.js';

export type AudioIssueLevel = 'blocker' | 'warning' | 'info';

export type AudioIssue =
  /** Switched on with nothing to play. The one blocker, and publication refuses it. */
  | { code: 'AUD_NO_CLIP'; level: 'blocker'; part: 'source' }
  /** The student is told to listen to something unnamed. */
  | { code: 'AUD_NO_TITLE'; level: 'warning'; part: 'source' }
  /** A transcript policy that will never show anything. */
  | { code: 'AUD_NO_TRANSCRIPT'; level: 'warning'; part: 'transcript' }
  /** One listen for a set of questions nobody can hold in their head. */
  | { code: 'AUD_ONE_PLAY_MANY_ITEMS'; level: 'warning'; part: 'rules'; items: number }
  /** A limit next to a scrub bar: the student replays by dragging, for free. */
  | { code: 'AUD_LIMIT_WITH_SEEK'; level: 'info'; part: 'rules' }
  /** A timecode that ends before it starts plays nothing. */
  | { code: 'AUD_SEG_INVERTED'; level: 'warning'; part: 'segments'; itemId: string }
  /** A timecode past the end of the clip, as far as the stored duration knows. */
  | { code: 'AUD_SEG_BEYOND'; level: 'warning'; part: 'segments'; itemId: string };

export type AudioIssueCode = AudioIssue['code'];
export type AudioIssuePart = AudioIssue['part'];

/** Which of the host builder's steps owns each part of the layer. */
export type AudioStepMap = Record<AudioIssuePart, number>;

/** An item as this module needs to see it: an id, and whatever audio it carries. */
export interface AudioItem {
  id: string;
  audio?: unknown;
}

/** An issue with the host's step number attached, ready for a rail or a gate. */
export type PlacedAudioIssue = AudioIssue & { step: number };

/**
 * More items than this on one listen and the exercise stops testing listening and starts
 * testing memory. Four is the handoff's number.
 */
const CROWDED = 4;

/**
 * Everything wrong with the audio, in authoring order: source, timecodes, rules,
 * transcript.
 *
 * Silent for a document with audio switched off — including one that has never heard of
 * this feature. A teacher who has not asked for listening is not told about it.
 */
export function audioIssues(content: unknown, items: readonly AudioItem[] = []): AudioIssue[] {
  const audio = audioOf(content);
  if (!audio.enabled) return [];

  const out: AudioIssue[] = [];

  if (!hasClip(audio)) {
    out.push({ code: 'AUD_NO_CLIP', level: 'blocker', part: 'source' });
  }
  if (audio.title.trim() === '') {
    out.push({ code: 'AUD_NO_TITLE', level: 'warning', part: 'source' });
  }

  out.push(...segmentIssues(audio, items));

  if (audio.settings.plays === 1 && items.length > CROWDED) {
    out.push({
      code: 'AUD_ONE_PLAY_MANY_ITEMS',
      level: 'warning',
      part: 'rules',
      items: items.length,
    });
  }
  if (audio.settings.plays > 0 && audio.settings.seek) {
    out.push({ code: 'AUD_LIMIT_WITH_SEEK', level: 'info', part: 'rules' });
  }

  if (audio.settings.transcriptWhen !== 'never' && audio.transcript.trim() === '') {
    out.push({ code: 'AUD_NO_TRANSCRIPT', level: 'warning', part: 'transcript' });
  }

  return out;
}

function segmentIssues(audio: ExerciseAudio, items: readonly AudioItem[]): AudioIssue[] {
  if (!audio.useSegments) return [];

  const out: AudioIssue[] = [];
  for (const item of items) {
    const seg = segmentOf(audio, item);
    if (seg === null) continue;

    if (seg.end <= seg.start) {
      out.push({ code: 'AUD_SEG_INVERTED', level: 'warning', part: 'segments', itemId: item.id });
      continue;
    }
    // Only when a duration is known. It is a client-side hint (§3.7), and warning against
    // an unknown length would fire on every exercise whose file has not been opened yet.
    if (audio.duration > 0 && seg.end > audio.duration) {
      out.push({ code: 'AUD_SEG_BEYOND', level: 'warning', part: 'segments', itemId: item.id });
    }
  }
  return out;
}

/** The same list, with each issue placed on the step of the host that owns its fix. */
export function placeAudioIssues(
  issues: readonly AudioIssue[],
  steps: AudioStepMap,
): PlacedAudioIssue[] {
  return issues.map((issue) => ({ ...issue, step: steps[issue.part] }));
}

/** Does anything here stop publication? The question the pre-assign gate asks. */
export function hasAudioBlocker(issues: readonly AudioIssue[]): boolean {
  return issues.some((issue) => issue.level === 'blocker');
}
