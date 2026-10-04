// Comparing one cell — `itNorm`, `itCellOk`, `itNearMiss` of the handoff's data.jsx, ported by
// behaviour (plan 69 §4.2).
//
// **Diacritics never fold.** `bøker` and `boker` are different answers, as in `dictation`
// (DECISIONS). What is forgiven is what carries no grammar: case, the spaces around and inside
// a form, and the Unicode spelling of a letter — a phone keyboard may send `ø` composed or `å`
// as `a` + ring, and the learner wrote the same letter either way (NFC, plan 68 §4.2 item 7).
//
// A near miss adds one line to the feedback and never turns a wrong cell into a right one:
//
//   diacritic — the form is right but for letters the language does not fold (`bøker` written
//               `boker` or `boeker`). The letters are the course language's pack `fold` from
//               `dictation` — one table per language (plan 69, deviation 17); the prototype
//               hard-coded `åøæ`. No pack, no class.
//   ending    — the prototype's rule as it stands: lengths within one letter and the first
//               three letters shared — right stem, wrong ending.

import { packOf as dictationPackOf } from '../dictation/presets.js';
import type { Cell } from './model.js';

export type NearMiss = 'diacritic' | 'ending';

/** NFC, trimmed, inner whitespace collapsed, lower case. Letters are never folded. */
export function norm(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Every spelling this cell accepts, normalised: the key first, then its variants. */
export function keysOf(cell: Pick<Cell, 'value' | 'accept'>): string[] {
  return [cell.value, ...cell.accept].map(norm).filter((k) => k !== '');
}

/** Right when the answer is the key or one of this cell's variants. Empty is never right. */
export function cellOk(cell: Pick<Cell, 'value' | 'accept'>, got: string): boolean {
  const answer = norm(got);
  return answer !== '' && keysOf(cell).includes(answer);
}

/**
 * What kind of almost-right a wrong answer is, or `null`.
 *
 * Checked against the key and each variant, so `boken` accepted beside `boka` makes `bøken` a
 * diacritic slip too. `diacritic` is asked first: `boker` against `bøker` also passes the
 * ending rule, and the letter is the more useful thing to say.
 */
export function nearMiss(
  cell: Pick<Cell, 'value' | 'accept'>,
  got: string,
  language: string,
): NearMiss | null {
  const answer = norm(got);
  const keys = keysOf(cell);
  if (answer === '' || keys.length === 0 || keys.includes(answer)) return null;

  const fold = dictationPackOf(language).fold;
  if (Object.keys(fold).length > 0) {
    const plain = skeleton(answer, fold);
    if (keys.some((k) => skeleton(k, fold) === plain)) return 'diacritic';
  }

  const key = keys[0] as string;
  if (Math.abs(key.length - answer.length) <= 1 && key.slice(0, 3) === answer.slice(0, 3)) {
    return 'ending';
  }
  return null;
}

/**
 * The form with every non-folding letter and its ASCII spellings reduced to one plain letter:
 * `bøker`, `boeker` and `boker` all read `boker`. Used only to name a slip, both sides alike —
 * never to grade.
 */
function skeleton(text: string, fold: Readonly<Record<string, string>>): string {
  let out = text;
  for (const [letter, spelling] of Object.entries(fold)) {
    const plain = spelling.charAt(0);
    out = out.split(letter).join(plain);
    if (spelling.length > 1) out = out.split(spelling).join(plain);
  }
  return out;
}
