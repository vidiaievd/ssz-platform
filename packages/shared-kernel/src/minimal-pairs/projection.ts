// What a student is allowed to see before the first probe (plan 72 §3.2).
//
// Only what the runner draws before a probe is handed out, and what the reader card says: the
// title, the instruction, the contrast's label, the number of probes, the listening budget and
// the feedback switches. **No pair, no word, no clip and no asset id** — which clip is which
// word is the answer, and probes arrive one at a time from the engine. No pass mark either: it
// comes back with the result (plan 72 §5, row 13).

import type { Feedback } from './model.js';
import { exerciseContrast } from './packs/index.js';
import { readContent } from './persistence.js';

export interface StudentProjection {
  title: string;
  instruction: string;
  language: string;
  /** Seen by the student: «kj / sj», «ç – ʃ». Empty when the pack does not know the family. */
  contrast: { label: string; ipa: string };
  set: { probes: number; playsPerProbe: 0 | 1 | 2 | 3; autoplay: boolean };
  feedback: Feedback;
}

export function toStudentProjection(content: unknown): StudentProjection {
  const c = readContent(content);
  const family = exerciseContrast({ ...c, pairs: [] });
  return {
    title: c.title,
    instruction: c.instruction,
    language: c.language,
    contrast: { label: family?.label ?? '', ipa: family?.ipa ?? '' },
    set: { probes: c.set.probes, playsPerProbe: c.set.playsPerProbe, autoplay: c.set.autoplay },
    feedback: { ...c.feedback },
  };
}

/**
 * The projection of an assignment (plan 72 Q6-A): one try per probe, as every dosed type gets
 * one check per item in `GRADED`. The verdict, the A/B comparison and the reveal stay as the
 * author set them — they are the exercise, and the key of one probe says nothing about the
 * next. The engine judges by `maxTries(feedback, graded)` either way; this is so the runner
 * draws what the judge will do. Anything that is not a projection is handed back untouched.
 */
export function withGradedSettings(projection: unknown): unknown {
  if (typeof projection !== 'object' || projection === null || Array.isArray(projection)) return projection;
  const p = projection as Record<string, unknown>;
  const feedback = p['feedback'];
  if (typeof feedback !== 'object' || feedback === null) return projection;
  return { ...p, feedback: { ...(feedback as Record<string, unknown>), secondChance: false } };
}
