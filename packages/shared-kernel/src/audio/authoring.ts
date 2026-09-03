// The authored side of the audio block — plan 56 phase 4.
//
// The problem this file exists for is the mirror of the projection's. Every template's
// `toContent` builds an explicit object out of the fields it knows about, which is right
// — a persistence function that spread whatever it was given would write the builder's
// scratch state into the database — and it means a block belonging to no template would
// be dropped by the first autosave.
//
// So the layer travels beside the document rather than inside the template's type: the
// builder holds an `AudioDraft`, reads it out of the loaded document, and writes it back
// on top of what `toContent` produced. Nine templates, three lines each, and not one of
// their models learns about a field that is not theirs.
//
// The draft keeps the timecodes in a map for the same reason the projection does: an item
// is `questions[]` here, `rows[]` there and `pairs[]` in the third, and a map keyed by
// item id is the one shape that does not care.

import { audioIssues, type AudioIssue } from './issues.js';
import { itemKey, itemsOf } from './items.js';
import type { ExerciseAudio, ItemAudio } from './model.js';
import { audioOf, hasClip } from './model.js';

export interface AudioDraft {
  audio: ExerciseAudio;
  /** Timecodes by item id. Only meaningful while `audio.useSegments` is on. */
  segments: Record<string, ItemAudio>;
  /**
   * Whether the loaded document carried an audio block at all.
   *
   * The difference between "never had audio" and "had it and it is switched off" is not
   * visible in the block itself, and the two must persist differently: the first must
   * round-trip through the builder without gaining a field, the second must keep its clip
   * so that re-enabling restores it (BEHAVIOR §1). This is that difference, carried.
   */
  present: boolean;
}

/** Read the layer off a loaded document, for the builder to edit. */
export function readAudioDraft(content: unknown, templateCode: string): AudioDraft {
  const audio = audioOf(content);
  const segments: Record<string, ItemAudio> = {};
  const doc =
    typeof content === 'object' && content !== null && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : null;

  // Read regardless of `useSegments`: switching timecodes off must not lose the ones
  // already written, exactly as switching audio off does not lose the clip (BEHAVIOR §1).
  for (const item of itemsOf(templateCode, content)) {
    const raw = item.audio;
    if (typeof raw !== 'object' || raw === null) continue;
    const { start, end } = raw as { start?: unknown; end?: unknown };
    if (typeof start === 'number' && typeof end === 'number') segments[item.id] = { start, end };
  }

  return { audio, segments, present: doc !== null && doc['audio'] !== undefined };
}

/**
 * Has anything been said about audio on this exercise?
 *
 * Not the same question as "is it switched on". An author who attached a clip, wrote a
 * transcript and then turned the switch off has said a great deal, and switching off must
 * not throw it away. What this excludes is the exercise nobody has touched: those keep the
 * shape they were written in.
 */
function touched(draft: AudioDraft): boolean {
  const a = draft.audio;
  return (
    draft.present ||
    a.enabled ||
    hasClip(a) ||
    a.title.trim() !== '' ||
    a.transcript.trim() !== '' ||
    a.translation.trim() !== '' ||
    Object.keys(draft.segments).length > 0
  );
}

/**
 * Write the layer back onto what the template's own `toContent` produced.
 *
 * Returns the persisted object **unchanged** for an exercise nobody has said anything
 * about: every document written before this feature must round-trip through the builder
 * without gaining a field.
 */
export function applyAudioDraft(
  persisted: Record<string, unknown>,
  draft: AudioDraft,
  templateCode: string,
): Record<string, unknown> {
  if (!touched(draft)) return persisted;

  const out: Record<string, unknown> = { ...persisted, audio: draft.audio };

  const key = itemKey(templateCode);
  if (key === null || !Array.isArray(persisted[key])) return out;

  out[key] = (persisted[key] as unknown[]).map((item) => {
    if (typeof item !== 'object' || item === null) return item;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string') return item;

    const segment = draft.segments[id];
    // A timecode written and then cleared has to be removed, not left behind: the item
    // would otherwise keep offering a fragment its author deleted.
    const { audio: _dropped, ...rest } = item as Record<string, unknown>;
    return segment === undefined ? rest : { ...rest, audio: segment };
  });

  return out;
}

/** Set the block, keeping the timecodes. The one edit every card makes. */
export function withAudio(draft: AudioDraft, patch: Partial<ExerciseAudio>): AudioDraft {
  return { ...draft, audio: { ...draft.audio, ...patch } };
}

/** Set one of the block's settings. */
export function withAudioSettings(
  draft: AudioDraft,
  patch: Partial<ExerciseAudio['settings']>,
): AudioDraft {
  return { ...draft, audio: { ...draft.audio, settings: { ...draft.audio.settings, ...patch } } };
}

/** Set or clear one item's timecode. `null` removes it. */
export function withSegment(
  draft: AudioDraft,
  itemId: string,
  segment: ItemAudio | null,
): AudioDraft {
  const segments = { ...draft.segments };
  if (segment === null) delete segments[itemId];
  else segments[itemId] = segment;
  return { ...draft, segments };
}

/**
 * What is wrong with the audio the author is editing.
 *
 * The same `audioIssues` every other surface reads — the builder holds the layer as a
 * draft beside the document, so this is the one place that knows how to hand a draft to a
 * function written against a document. Items come from the host builder, because only it
 * knows what an item is.
 *
 * An id alone is enough for a template whose items can only carry timecodes. One that
 * keeps a clip per item (`translate`) passes the clip with the id, because under `source:
 * 'items'` that is what decides whether the exercise has anything to play at all.
 */
export function draftIssues(
  draft: AudioDraft,
  items: readonly (string | { id: string; clip?: string })[],
): AudioIssue[] {
  return audioIssues(
    { audio: draft.audio },
    items.map((item) => {
      const { id, clip } = typeof item === 'string' ? { id: item, clip: undefined } : item;
      return { id, audio: draft.segments[id], ...(clip === undefined ? {} : { clip }) };
    }),
  );
}
