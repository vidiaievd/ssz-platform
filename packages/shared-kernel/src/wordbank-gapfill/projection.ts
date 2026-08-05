// The student projection: what may leave the server before a check.
//
// For every other exercise template, `content` is safe to serve as it stands — the
// answers live in a separate column. This one stores the sentence solved, so the answer
// is a slice of `content.sentences[].text`, and serving the content raw would ship the
// answers to the browser. Nothing else about the type is dangerous; this is.
//
// BEHAVIOR.md §2.3: "the bank must not disclose which word is correct", and grading and
// explanation resolution happen server-side. This function is the cut.

import type { GapFillTask, GapKey } from './model.js';
import { bank, core, gaps, tokens } from './selectors.js';

/** A word of the sentence that is not a gap. Carries no information about the answers. */
export interface ProjectedTextToken {
  kind: 'text';
  text: string;
}

/**
 * A gap. The punctuation that surrounded the hidden word is kept, because it belongs to
 * the sentence rather than to the answer: without it, "Kan jeg få regningen, takk?"
 * would read "Kan jeg få ___ takk?" and lose its comma. The word itself is gone, and
 * nothing here discloses its length or its spelling.
 */
export interface ProjectedGapToken {
  kind: 'gap';
  gapKey: GapKey;
  label: string;
  /** Punctuation before the hidden word, e.g. the opening «. Usually empty. */
  before: string;
  /** Punctuation after it, e.g. a comma or full stop. Usually empty. */
  after: string;
}

export type ProjectedToken = ProjectedTextToken | ProjectedGapToken;

export interface ProjectedSentence {
  id: string;
  tokens: ProjectedToken[];
  hint?: string;
}

export interface StudentProjection {
  sentences: ProjectedSentence[];
  /** `null` in free-input mode, where there is no bank to show. */
  bank: string[] | null;
  /** Only the settings that change what the student sees. `caseSensitive` is a grading rule. */
  settings: {
    allowReuse: boolean;
    showBankCount: boolean;
    input: GapFillTask['settings']['input'];
  };
}

export interface ProjectionOptions {
  /**
   * Applied to the bank when `settings.shuffle` is on. Injected rather than done here so
   * that this module stays pure: the same document must always project the same way, or
   * it cannot be tested and the client and the server cannot be compared.
   */
  shuffle?: (words: string[]) => string[];
}

export function toStudentProjection(
  task: GapFillTask,
  options: ProjectionOptions = {},
): StudentProjection {
  const gapsByKey = new Map(gaps(task).map((gap) => [`${gap.sentenceId}#${gap.tokenIndex}`, gap]));

  const sentences: ProjectedSentence[] = task.sentences.map((sentence) => ({
    id: sentence.id,
    ...(sentence.hint === undefined ? {} : { hint: sentence.hint }),
    tokens: tokens(sentence.text).map((token, tokenIndex): ProjectedToken => {
      const gap = gapsByKey.get(`${sentence.id}#${tokenIndex}`);
      if (gap === undefined) return { kind: 'text', text: token };

      const word = core(token);
      const at = token.indexOf(word);
      return {
        kind: 'gap',
        gapKey: gap.key,
        label: gap.label,
        before: word === '' ? '' : token.slice(0, at),
        after: word === '' ? '' : token.slice(at + word.length),
      };
    }),
  }));

  return {
    sentences,
    bank: projectBank(task, options.shuffle),
    settings: {
      allowReuse: task.settings.allowReuse,
      showBankCount: task.settings.showBankCount,
      input: task.settings.input,
    },
  };
}

function projectBank(task: GapFillTask, shuffle: ProjectionOptions['shuffle']): string[] | null {
  if (task.settings.input === 'free') return null;

  // `bank()` returns the answers first, because they are derived from the sentences and
  // the distractors are appended. Serving that order would hand the exercise away: the
  // first N chips would be the answers, in gap order.
  //
  // So the authoring order never reaches the student. `shuffle: false` does not mean
  // "the order the teacher sees" — there is no such order — it means "the same order
  // every time", and sorting gives that without disclosing anything. Comparison is on
  // NFC code points rather than `localeCompare`, so the order does not depend on the
  // server's locale.
  const words = bank(task)
    .map(({ word }) => word.normalize('NFC'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return task.settings.shuffle && shuffle !== undefined ? shuffle(words) : words;
}
