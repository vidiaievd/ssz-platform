// What makes two words equal, and why two unequal words are unequal — SPEC_data_model §3–4.
//
// ── The comparison key ──────────────────────────────────────────────────────
//
//   key(token) = (caseSensitive ? w : lower(w)) + (punctuation ? "\u0001" + p : "")
//
// Diacritics **never** fold in the key: `å` is a letter, and a system that accepted `aa`
// would teach that it is a spelling variant (DECISIONS §2). The one exception is a spelling
// the course's language pack declares accepted (`accepted`), which is mapped onto its letter
// on both sides before comparing.
//
// ── The classifier ──────────────────────────────────────────────────────────
// First match wins, and decides both the colour and the sentence in the verdict:
//
//   punctuation — the words are equal under the case rule, the punctuation is not
//   case        — equal ignoring case (reachable only with `caseSensitive`)
//   diacritic   — equal after folding the pack's letters (`paa`/`på`), **or** one edit apart
//                 where the edit touches one of them (`horte`/`hørte`) — never a slip
//   typo        — Levenshtein ≤ 1 and the target has 4+ letters
//   wrong       — anything else
//
// Two departures from the prototype, both towards the documents (plan 68 §4.2):
//
//   * the prototype compared `case` on the raw words, so with capitals off and punctuation on
//     a word differing in case *and* comma was reported as a capital-letter error — the
//     capital that does not count. Words are compared under the case rule first;
//   * the prototype called `hørte` → `horte` a typo — one letter, five letters long — which
//     makes it «almost right». DECISIONS §3: never a diacritic difference.
//
// Levenshtein is the kernel's one (`short-answer/matching.ts`, CLAUDE.md rule 4): it returns
// 2 for anything over one, which is all `≤ 1` needs.

import { levenshtein } from '../short-answer/matching.js';
import type { Marking } from './model.js';
import type { LanguagePack } from './presets.js';
import type { DcToken } from './tokens.js';

/** The class of a substitution. `boundary` is decided by the diff's seam, not here. */
export type ErrorClass = 'punctuation' | 'case' | 'diacritic' | 'typo' | 'wrong' | 'boundary';

export const ERROR_CLASSES: readonly ErrorClass[] = [
  'punctuation',
  'case',
  'diacritic',
  'typo',
  'wrong',
  'boundary',
];

/** Which classes a near miss can be — never a diacritic, a boundary or another word. */
export const NEARABLE: Readonly<Record<ErrorClass, boolean>> = {
  punctuation: true,
  case: true,
  typo: true,
  diacritic: false,
  boundary: false,
  wrong: false,
};

/** The shortest word a one-letter slip is tolerated on (DECISIONS §3). */
const TYPO_MIN_LETTERS = 4;

/** Map each accepted spelling onto its letter, so `vaere` and `være` compare equal. */
export function acceptSpellings(word: string, pack: LanguagePack): string {
  let out = word;
  for (const [letter, spellings] of Object.entries(pack.accepted)) {
    for (const spelling of spellings) {
      if (spelling !== '') out = out.split(spelling).join(letter);
    }
  }
  return out;
}

function caseRule(word: string, marking: Marking): string {
  return marking.caseSensitive ? word : word.toLowerCase();
}

/** The comparison key of one token under the author's rules. */
export function compareKey(token: DcToken, marking: Marking, pack: LanguagePack): string {
  const w = acceptSpellings(caseRule(token.w, marking), pack);
  return marking.punctuation ? `${w}\u0001${token.p}` : w;
}

function fold(word: string, pack: LanguagePack): string {
  let out = '';
  for (const ch of word) out += pack.fold[ch] ?? ch;
  return out;
}

/**
 * Do these two (lower-case) words differ by one edit that touches a letter of the pack's
 * fold table — `hørte`/`horte`, `går`/`gar`, `går`/`gr`?
 */
function oneEditOnFoldLetter(a: string, b: string, pack: LanguagePack): boolean {
  const A = [...a];
  const B = [...b];
  const protectedLetter = (ch: string | undefined): boolean =>
    ch !== undefined && pack.fold[ch] !== undefined;

  if (A.length === B.length) {
    const diffs = A.flatMap((ch, k) => (ch === B[k] ? [] : [k]));
    if (diffs.length !== 1) return false;
    const k = diffs[0] as number;
    return protectedLetter(A[k]) || protectedLetter(B[k]);
  }
  if (Math.abs(A.length - B.length) !== 1) return false;
  const [long, short] = A.length > B.length ? [A, B] : [B, A];
  let k = 0;
  while (k < short.length && long[k] === short[k]) k++;
  // The rest must match once the one extra letter is skipped.
  if (long.slice(k + 1).join('') !== short.slice(k).join('')) return false;
  return protectedLetter(long[k]);
}

/** Why `got` is not `expected`. Called only on a pair the diff has already found unequal. */
export function classify(
  expected: DcToken,
  got: DcToken,
  marking: Marking,
  pack: LanguagePack,
): ErrorClass {
  const e = acceptSpellings(caseRule(expected.w, marking), pack);
  const g = acceptSpellings(caseRule(got.w, marking), pack);
  if (e === g && expected.p !== got.p) return 'punctuation';

  const el = e.toLowerCase();
  const gl = g.toLowerCase();
  if (e !== g && el === gl) return 'case';
  if (fold(el, pack) === fold(gl, pack) || oneEditOnFoldLetter(el, gl, pack)) return 'diacritic';
  if ([...el].length >= TYPO_MIN_LETTERS && levenshtein(el, gl) <= 1) return 'typo';
  return 'wrong';
}
