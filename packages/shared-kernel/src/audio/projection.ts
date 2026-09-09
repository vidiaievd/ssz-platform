// What a student may hold of the audio block — plan 56 §3.3.
//
// The transcript of a listening exercise **is the answer**. Not a hint, not context: the
// thing the student is being asked to hear. So it is dosed exactly the way every other
// key on this platform is dosed — withheld by the projection, and delivered by whatever
// already delivers the key — instead of being shipped with the document and hidden by a
// view, which would print the answer in the network tab.
//
// Three policies, three fates:
//
//   never   — withheld, always. The student never sees it.
//   always  — travels with the projection. It is the accommodation path for a
//             hard-of-hearing student, so it must be readable before the answer and even
//             while a `first` gate is closed (README, "Accessibility").
//   after   — withheld here, delivered with the key: with `/answers` for a template the
//             browser grades, and on the verdict for one the server grades.
//
// This step is cross-cutting rather than per-template, and it is the first thing in
// `studentSafeContent` that is. That is right for what it guards: the block is the same
// on all thirteen templates, so thirteen copies of this rule would be twelve chances to
// forget it. It also has to *add* the block back, because the six per-template
// projections build a new object and would otherwise drop the audio entirely.

import { itemsOf } from './items.js';
import type { ExerciseAudio, ItemAudio } from './model.js';
import { audioOf, segmentOf } from './model.js';

/**
 * The audio block as a learner may hold it: the same shape, minus the words, plus the
 * timecodes gathered up.
 *
 * `segments` exists because the per-template projections build a new object out of the
 * content column, and an item's timecode would not survive the trip — nine projections
 * would each have to learn to carry a field that is not theirs. Gathering them onto the
 * block instead keeps the layer in one piece: the runner looks a timecode up by item id,
 * whatever the template calls its items.
 */
export type StudentAudio = ExerciseAudio & { segments?: Record<string, ItemAudio> };

/**
 * Blank the transcript unless the policy is `always`.
 *
 * Blanked rather than deleted: the runner reads `settings.transcriptWhen` to know
 * whether words are still coming, and a field that disappears and reappears is a shape
 * a client has to special-case. An empty string with `transcriptWhen: 'after'` means
 * "not yet"; an empty string with `'never'` means "not ever". Both render nothing.
 */
export function redactTranscript(audio: ExerciseAudio): StudentAudio {
  if (audio.enabled && audio.settings.transcriptWhen === 'always') return audio;
  return { ...audio, transcript: '', translation: '' };
}

/** Every item's timecode, keyed by item id. Empty when the author is not using them. */
export function segmentsOf(templateCode: string, content: unknown): Record<string, ItemAudio> {
  const audio = audioOf(content);
  if (!audio.enabled || !audio.useSegments) return {};

  const out: Record<string, ItemAudio> = {};
  for (const item of itemsOf(templateCode, content)) {
    const segment = segmentOf(audio, item);
    if (segment !== null) out[item.id] = segment;
  }
  return out;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Put the student's copy of the audio block onto a projected document.
 *
 * A document that has never carried audio is returned **exactly as it was given** — the
 * same object, not a copy. Every exercise written before this feature goes through this
 * function, and none of them may come out different in any way.
 *
 * A document that carries a switched-off block still gets its transcript blanked. The
 * words are not shown either way, and a block kept for later (BEHAVIOR §1: switching off
 * never destroys the material) is not a reason to hand the answer over.
 */
export function withStudentAudio(
  projected: Record<string, unknown>,
  content: unknown,
  templateCode = '',
): Record<string, unknown> {
  const raw = record(content);
  if (raw === null || raw['audio'] === undefined) return projected;

  const segments = segmentsOf(templateCode, content);
  const audio: StudentAudio = redactTranscript(audioOf(content));

  return {
    ...projected,
    audio: Object.keys(segments).length > 0 ? { ...audio, segments } : audio,
  };
}

/**
 * The timecodes as they arrive on the wire, read back by a runner.
 *
 * The mirror of what `withStudentAudio` wrote, and defensive in the same way as
 * `audioOf`: a runner meeting a document from before this feature — or one whose author
 * has since turned timecodes off — gets an empty map rather than an exception.
 */
export function deliveredSegments(content: unknown): Record<string, ItemAudio> {
  const audio = record(record(content)?.['audio']);
  const segments = record(audio?.['segments']);
  if (segments === null) return {};

  const out: Record<string, ItemAudio> = {};
  for (const [id, value] of Object.entries(segments)) {
    const seg = record(value);
    const start = seg?.['start'];
    const end = seg?.['end'];
    if (typeof start === 'number' && typeof end === 'number') out[id] = { start, end };
  }
  return out;
}

/**
 * The transcript owed to a student who has reached the answer, or `null`.
 *
 * Answers the delivery side of the `after` policy: the BFF calls it with the document it
 * fetched alongside the key, the engine with the definition it graded against. `null`
 * for every other policy — `always` was served with the projection, and `never` is never.
 */
export function transcriptOnReveal(
  content: unknown,
): { transcript: string; translation: string } | null {
  const audio = audioOf(content);
  if (!audio.enabled || audio.settings.transcriptWhen !== 'after') return null;
  if (audio.transcript.trim() === '') return null;
  return { transcript: audio.transcript, translation: audio.translation };
}
