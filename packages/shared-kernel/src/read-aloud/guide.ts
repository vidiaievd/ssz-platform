// The pronunciation guide of a `read` exercise (plan 86, §4i.2 Q-i11 and §4i.4) — what makes
// its marks fit to publish.
//
// The marks are not in the document: each prompt has a prosody layer beside it, re-anchored to
// the prompt's text when read, and the lexicon's words are recomputed per text. Whoever checks
// (the builder, the server's preflight) reads both and passes them in as `GuidePrompt`s; this
// module only judges. Blockers hold only for what the author switched on:
//
//   · any lens — a word that should carry a stress the lexicon could not give (unknown, like
//     *Bartek*, or two readings left) has the author's answer: a stress or «no stress»;
//   · `melody` — every sentence ends a group with a pitch on its last word, because the melody
//     lens draws the end of each sentence and a passage without them shows a melody that stops.
//
// A layer the server could not check against its text (a stale anchor) blocks too: the mark
// would be drawn under another word. A prompt missing from the map is a prompt with an empty
// layer and nothing unresolved — when the lexicon is not reachable, nothing is asked of the
// author rather than everything.

import type { ProsodyAnchor, ProsodyLayer } from '../prosody/model.js';
import { anchorWords } from '../prosody/model.js';
import { prosodyIssues } from '../prosody/issues.js';
import { splitSentences } from '../text/sentences.js';
import { tokenize } from '../text/words.js';
import type { ReadAloudContent } from './model.js';

export interface GuidePrompt {
  /** The authored layer, re-anchored to the prompt's current text. */
  layer: ProsodyLayer;
  /** Words the lexicon left without the stress they should carry, anchored to the same text. */
  unresolved: readonly ProsodyAnchor[];
}

export type GuideIssue =
  /** Every lens is switched off: the learner would be offered a guide with nothing in it. */
  | { code: 'RA_GUIDE_NO_LENS'; level: 'blocker'; step: 6 }
  /** The layer does not lie on the text any more — `count` blockers of `prosodyIssues`. */
  | { code: 'RA_GUIDE_LAYER_INVALID'; level: 'blocker'; step: 6; promptId: string; count: number }
  | {
      code: 'RA_GUIDE_WORD_UNCONFIRMED';
      level: 'blocker';
      step: 6;
      promptId: string;
      i: number;
      w: string;
    }
  /** `sentence` is the index of `splitSentences`; `i` its last word, where the group end goes. */
  | {
      code: 'RA_GUIDE_SENTENCE_NO_END';
      level: 'blocker';
      step: 6;
      promptId: string;
      sentence: number;
      i: number;
    }
  /** Marks an edit of the text left without their words. */
  | { code: 'RA_GUIDE_ORPHANS'; level: 'warning'; step: 6; promptId: string; count: number };

/** Whether the builder shows the «Pronunciation» step and the guide is checked at all. */
export function guideShown(ex: ReadAloudContent): boolean {
  return ex.mode === 'read' && ex.pronunciationGuide.enabled;
}

export function guideIssues(
  ex: ReadAloudContent,
  prompts: Readonly<Record<string, GuidePrompt>>,
): GuideIssue[] {
  if (!guideShown(ex)) return [];
  const { lenses } = ex.pronunciationGuide;
  if (lenses.length === 0) return [{ code: 'RA_GUIDE_NO_LENS', level: 'blocker', step: 6 }];

  const out: GuideIssue[] = [];
  for (const p of ex.prompts) {
    if (p.text.trim() === '') continue;
    const given = prompts[p.id];
    if (!given) continue;
    const { layer, unresolved } = given;

    const invalid = prosodyIssues(p.text, layer).filter((x) => x.level === 'blocker').length;
    if (invalid > 0) {
      // Every other check reads anchors; on a layer off its text they would only list noise.
      out.push({
        code: 'RA_GUIDE_LAYER_INVALID',
        level: 'blocker',
        step: 6,
        promptId: p.id,
        count: invalid,
      });
      continue;
    }

    const answered = new Map<number, string>();
    for (const s of layer.stresses) answered.set(s.i, anchorWords(s).join(' '));
    for (const u of layer.unstressed ?? []) answered.set(u.i, anchorWords(u).join(' '));
    for (const word of unresolved) {
      if (answered.get(word.i) !== anchorWords(word).join(' ')) {
        out.push({
          code: 'RA_GUIDE_WORD_UNCONFIRMED',
          level: 'blocker',
          step: 6,
          promptId: p.id,
          i: word.i,
          w: word.w,
        });
      }
    }

    if (lenses.includes('melody')) {
      const ends = new Set(layer.boundaries.filter((b) => b.pitch !== null).map((b) => b.i));
      for (const sentence of splitSentences(p.text, tokenize(p.text))) {
        const last = sentence.end - 1;
        if (!ends.has(last)) {
          out.push({
            code: 'RA_GUIDE_SENTENCE_NO_END',
            level: 'blocker',
            step: 6,
            promptId: p.id,
            sentence: sentence.index,
            i: last,
          });
        }
      }
    }

    if (layer.orphans.length > 0) {
      out.push({
        code: 'RA_GUIDE_ORPHANS',
        level: 'warning',
        step: 6,
        promptId: p.id,
        count: layer.orphans.length,
      });
    }
  }
  return out;
}
