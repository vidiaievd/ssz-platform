// The prosody layer — plan 86, §4a. Stress, toneme and phrase intonation drawn under a text,
// «as in Bonk»: an arc under each stressed word from its stressed vowel, an arrow under the
// pause that ends a group.
//
// The layer sits **beside** the text and never changes it. Every element is anchored to a
// word by its token index (`tokenize`, `unicode-word-v1`) and a snapshot of that word, so an
// edit of the text can be followed (`reanchorProsody`) and a stale anchor is visible
// (`prosodyIssues`) instead of landing on the wrong word.
//
// Two kinds of content, from two places (decision 4 of §4a):
//   · **word stress** — which vowel is stressed, its length, the toneme. Comes from the
//     pronunciation lexicon (NB Uttale) for any text, free and automatic; an author may
//     override a word, e.g. a homograph the lexicon got wrong.
//   · **phrase marks** — phrase accent, group ends with their pitch and pause, linking.
//     Only a teacher or the authoring agent sets them; a text nobody marked has none.
// The stored layer holds what an author set; the student gets it merged over the lexicon
// words (`mergeProsody`). Lexicon words are recomputed per text and never stored.
//
// Shapes only — no language knowledge here. Norwegian spelling rules are in `spelling.ts`.

import { TOKENIZER_ID } from '../text/words.js';

export type ProsodySource = 'lexicon' | 'teacher' | 'ai';

/** Who may set phrase marks — never the lexicon. */
export type PhraseSource = Exclude<ProsodySource, 'lexicon'>;

/** Tonelag 1 (a rise from the stressed vowel) or 2 (fall, then rise). */
export type Toneme = 1 | 2;

/**
 * Where an element sits: the token it is on, and that token as written when it was set.
 *
 * `w` is compared lower-cased — re-capitalising a word never invalidates its marks. For a
 * linking, `i` is the first of the two words joined and `w` holds both, space-separated.
 */
export interface ProsodyAnchor {
  i: number;
  w: string;
}

/** The stressed vowel, as character offsets inside the word (`e` exclusive). */
export interface StressedVowel {
  s: number;
  e: number;
  /**
   * Long vowel (NoFAbet `AA EE II OO UU YY OE AE OA`, diphthongs). Drawn with a bar under it.
   * `null` when unknown: the notation does not carry length, so a word an author marked and
   * the lexicon does not know has none.
   */
  long: boolean | null;
}

export interface WordStress extends ProsodyAnchor {
  /**
   * `null` for a stressed monosyllable — drawn as a dot, written as a bare `'`. Monosyllables
   * carry no toneme mark (§4a, decision 1); a word with a null toneme is one by contract.
   */
  toneme: Toneme | null;
  vowel: StressedVowel;
  source: ProsodySource;
}

/**
 * An author's «this word has no stress» (plan 86, §4i.4): a lexicon stress that is wrong on a
 * function word, or a word the lexicon does not know — a name like *Bartek* — confirmed as
 * left bare. It takes the lexicon's stress off its word and settles the publish check that
 * asks the author about unknown words (`guideIssues` of `read_aloud`).
 */
export interface WordUnstressed extends ProsodyAnchor {
  source: PhraseSource;
}

/** The word a phrase carries its accent on — bold, with a deeper arc. */
export interface PhraseAccent extends ProsodyAnchor {
  source: PhraseSource;
}

export type GroupPitch = 'rise' | 'fall' | 'level';
export type GroupPause = 'short' | 'long';

/** The end of an intonation group, after the anchored word. At least one of the two is set. */
export interface GroupBoundary extends ProsodyAnchor {
  pitch: GroupPitch | null;
  pause: GroupPause | null;
  source: PhraseSource;
}

/** `‿` — the anchored word runs into the next one without a break. */
export interface WordLink extends ProsodyAnchor {
  source: PhraseSource;
}

export type ProsodyElement =
  | { kind: 'stress'; mark: WordStress }
  | { kind: 'unstressed'; mark: WordUnstressed }
  | { kind: 'accent'; mark: PhraseAccent }
  | { kind: 'boundary'; mark: GroupBoundary }
  | { kind: 'link'; mark: WordLink };

export type ProsodyKind = ProsodyElement['kind'];

/** A mark whose words an edit removed. Kept for the author to put back or drop. */
export type ProsodyOrphan = ProsodyElement;

export interface ProsodyLayer {
  /** The tokenizer the anchors were counted with. */
  tokenizer: typeof TOKENIZER_ID;
  /** Sorted by `i`, at most one per token. */
  stresses: WordStress[];
  /**
   * Optional because layers saved before it (plan 86, step 6h) do not carry it; read it with
   * `?? []`. Never on the same token as a stress (`PR_STRESS_CONFLICT`).
   */
  unstressed?: WordUnstressed[];
  accents: PhraseAccent[];
  boundaries: GroupBoundary[];
  links: WordLink[];
  orphans: ProsodyOrphan[];
}

export function emptyProsodyLayer(): ProsodyLayer {
  return {
    tokenizer: TOKENIZER_ID,
    stresses: [],
    unstressed: [],
    accents: [],
    boundaries: [],
    links: [],
    orphans: [],
  };
}

/** The anchor's words, lower-cased — what an anchor is matched by. */
export function anchorWords(anchor: ProsodyAnchor): string[] {
  return anchor.w
    .split(/\s+/)
    .filter((x) => x.length > 0)
    .map((x) => x.toLowerCase());
}

/** How many tokens an element of this kind spans. */
export function anchorLength(kind: ProsodyKind): number {
  return kind === 'link' ? 2 : 1;
}

/** Every element of the layer, orphans excluded, tagged with its kind. */
export function elementsOf(layer: ProsodyLayer): ProsodyElement[] {
  return [
    ...layer.stresses.map((mark) => ({ kind: 'stress' as const, mark })),
    ...(layer.unstressed ?? []).map((mark) => ({ kind: 'unstressed' as const, mark })),
    ...layer.accents.map((mark) => ({ kind: 'accent' as const, mark })),
    ...layer.boundaries.map((mark) => ({ kind: 'boundary' as const, mark })),
    ...layer.links.map((mark) => ({ kind: 'link' as const, mark })),
  ];
}

/** The inverse of `elementsOf`: elements back into lists, each sorted by token. */
export function layerOf(
  elements: readonly ProsodyElement[],
  orphans: ProsodyOrphan[] = [],
): ProsodyLayer {
  const layer = emptyProsodyLayer();
  for (const el of elements) {
    if (el.kind === 'stress') layer.stresses.push(el.mark);
    else if (el.kind === 'unstressed') (layer.unstressed ??= []).push(el.mark);
    else if (el.kind === 'accent') layer.accents.push(el.mark);
    else if (el.kind === 'boundary') layer.boundaries.push(el.mark);
    else layer.links.push(el.mark);
  }
  const byToken = (a: ProsodyAnchor, b: ProsodyAnchor) => a.i - b.i;
  layer.stresses.sort(byToken);
  layer.unstressed?.sort(byToken);
  layer.accents.sort(byToken);
  layer.boundaries.sort(byToken);
  layer.links.sort(byToken);
  layer.orphans = orphans;
  return layer;
}
