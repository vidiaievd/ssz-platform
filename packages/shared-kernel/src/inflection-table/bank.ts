// The word bank — `itBank` of the handoff, with its distractors generated rather than listed.
//
// The bank holds the key of every graded cell once, plus `input.bankExtra` distractors: forms
// that belong to no cell. Without them the bank is a matching puzzle — every word must be used.
//
// **Where distractors come from — decision Q2-A of plan 69.** The prototype shipped a fixed
// Norwegian list (`bøkene`, `husa`, `søsterne`, `jobba`, `eplene`) — on inspection, the right
// stem with an ending from the wrong pattern. That is what is generated here, from the pack:
// each slot names plausible endings (`Slot.endings`), the row gives the stem, and a candidate
// survives only if it is no key, no variant and no given form anywhere in the table — nor a
// variant the standard allows beside one (`Slot.swaps`), nor a spelling that is no word
// (`ParadigmPack.implausible`). Fewer, believable distractors over more, guessable ones: a short
// bank is reported (`IT_BANK_SHORT`), a bank of non-words is not noticed by anyone. Cells take
// turns, so five distractors are spread over the table instead of piling up on the first row.
// Deterministic — the same document always offers the same forms; only their order is dealt
// per attempt.
//
// A form may be placed more than once (the prototype marks it used and leaves it live), so the
// engine reports the bank with `wordsConsumed: false`.

import { bare } from './dictionary.js';
import { norm } from './compare.js';
import { gradedCells } from './derive.js';
import type { InflectionTableContent, Row } from './model.js';
import { packOf, paradigmOf, slotsInPlay } from './model.js';
import type { ParadigmPack } from './packs.js';

/** The generated distractors, at most `input.bankExtra` of them. */
export function distractors(ex: InflectionTableContent): string[] {
  const pack = packOf(ex);
  const paradigm = paradigmOf(ex);
  const want = Math.max(0, Math.trunc(ex.input.bankExtra));
  if (!pack || !paradigm || want === 0) return [];

  const taken = new Set<string>();
  const slots = slotsInPlay(ex);
  for (const row of ex.rows) {
    for (const slot of slots) {
      const cell = row.cells[slot.id];
      if (!cell) continue;
      for (const form of [cell.value, ...cell.accept]) {
        const n = norm(form);
        if (n === '') continue;
        taken.add(n);
        // The variant the standard allows beside it is right too, written down or not.
        for (const [from, to] of slot.swaps ?? []) {
          if (n.endsWith(from) && n.length > from.length) taken.add(n.slice(0, -from.length) + to);
        }
      }
    }
  }

  const queues = gradedCells(ex).map((c) =>
    c.slot.endings.map((pattern) => spell(pattern, c.row, pack, paradigm.stem)),
  );

  const out: string[] = [];
  for (let round = 0; out.length < want && queues.some((q) => q.length > round); round += 1) {
    for (const queue of queues) {
      const candidate = queue[round];
      if (candidate === undefined) continue;
      const n = norm(candidate);
      if (n === '' || taken.has(n)) continue;
      if (pack.implausible.some((seq) => n.includes(seq))) continue;
      taken.add(n);
      out.push(candidate.trim());
      if (out.length === want) break;
    }
  }
  return out;
}

/** How many distractors the author asked for and the pack could not make (`IT_BANK_SHORT`). */
export function distractorShortfall(ex: InflectionTableContent): number {
  if (ex.input.mode !== 'bank') return 0;
  return Math.max(0, Math.trunc(ex.input.bankExtra) - distractors(ex).length);
}

/**
 * Every form the bank offers, in authoring order: each key once, then the distractors.
 * Variants are not offered — a variant is accepted when typed, it does not have to be pickable.
 */
export function bankForms(ex: InflectionTableContent): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const form of [...gradedCells(ex).map((c) => c.cell.value), ...distractors(ex)]) {
    const n = norm(form);
    if (n === '' || seen.has(n)) continue;
    seen.add(n);
    out.push(form.trim());
  }
  return out;
}

/** Whether a submitted form is one the bank offers. Anything else is a client bug. */
export function inBank(ex: InflectionTableContent, form: string): boolean {
  const n = norm(form);
  return bankForms(ex).some((f) => norm(f) === n);
}

function stemOf(row: Row, pack: ParadigmPack, rule: 'lemma' | 'drop-e'): string {
  const word = bare(row.lemma, pack);
  if (rule === 'drop-e' && word.length > 2 && word.endsWith('e')) return word.slice(0, -1);
  return word;
}

/**
 * One pattern spelt out for a row: `{s}` the stem, `{w}` the bare lemma. Where the stem ends in a
 * letter of `pack.elide` and the ending starts with the same letter, it is written once.
 */
function spell(pattern: string, row: Row, pack: ParadigmPack, rule: 'lemma' | 'drop-e'): string {
  const values: Record<string, string> = { s: stemOf(row, pack, rule), w: bare(row.lemma, pack) };
  return pattern.replace(/\{([sw])\}(.?)/g, (_, token: string, next: string) => {
    const base = values[token] ?? '';
    const last = base.slice(-1).toLowerCase();
    if (next !== '' && last === next.toLowerCase() && pack.elide.includes(last)) return base + next.slice(1);
    return base + next;
  });
}
