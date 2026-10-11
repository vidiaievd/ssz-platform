// What an attempt is allowed to move (plan 73 §3.9; DECISIONS §4).
//
// The form as a whole rates a **skill** — selective listening, or selective reading when the
// source is a text. What transfers between two of these exercises is the genre, not the words:
// a student who can sift a recorded announcement for four facts can sift the next one.
//
// The words are rated only under `skill+words`, and only on `word` and `name` cells: a time, a
// price and a phone number are not vocabulary, and rating one would put noise into a word's
// schedule. Under `skill` and `none` every vocabulary atom is taken out of what the attempt
// carries; under `none` the skill atom is not sent either.
//
// The skill atom is named by the course language (decision Q3-A): selective listening in
// Norwegian and in Ukrainian are two skills of one student. Until plan 63 phase 7 there is no
// card for it in learning — the atom travels as a target of the whole exercise, analytics
// records the evidence, and the form comes back to review cell by cell (`EXERCISE_GAP`).

import { packOf, skillOf } from './derive.js';
import type { InformationTransferContent } from './model.js';
import { isLexicalType } from './model.js';

/** The atom type the form rates. A string, as the event's `atomType` is on purpose. */
export const SKILL_ATOM_TYPE = 'skill';

/** The vocabulary atom type, as the events spell it. */
const VOCABULARY_ATOM_TYPE = 'vocabulary_item';

/** `nb:selective_listening` — the pack's language, not the course's spelling of it. */
export function skillAtomId(ex: Pick<InformationTransferContent, 'language' | 'sourceKind'>): string {
  const lang = packOf(ex)?.language ?? (ex.language.toLowerCase().split(/[-_]/)[0] ?? '');
  return `${lang}:${skillOf(ex)}`;
}

/** The skill atoms an attempt rates: one, or none under `none`. */
export function skillAtoms(
  ex: Pick<InformationTransferContent, 'language' | 'sourceKind' | 'scoring'>,
): { atomType: string; atomId: string }[] {
  if (ex.scoring.memory === 'none') return [];
  return [{ atomType: SKILL_ATOM_TYPE, atomId: skillAtomId(ex) }];
}

/** Only `skill+words` lets the cells reach the words. */
export function ratesWords(ex: Pick<InformationTransferContent, 'scoring'>): boolean {
  return ex.scoring.memory === 'skill+words';
}

/**
 * The atoms a cell carries, with what the memory setting forbids taken out: vocabulary atoms stay
 * only under `skill+words` and only on a `word`/`name` cell. Anything else the author addressed
 * (a grammar atom) is left alone.
 */
export function cellAtomsForMemory<T extends { atomType: string }>(
  ex: Pick<InformationTransferContent, 'scoring' | 'fields'>,
  fieldId: string,
  atoms: readonly T[],
): T[] {
  const field = ex.fields.find((f) => f.id === fieldId);
  const keepWords = ratesWords(ex) && field !== undefined && isLexicalType(field.type);
  return keepWords ? [...atoms] : atoms.filter((a) => a.atomType !== VOCABULARY_ATOM_TYPE);
}

/**
 * The exercise-level atoms (the practised-atom graph, the exercise's own addresses) with the same
 * rule applied: a word survives only under `skill+words`, and only if a lexical cell addresses it
 * — `lexicalWordIds` are those addresses.
 */
export function practicedAtomsForMemory<T extends { atomType: string; atomId: string }>(
  ex: Pick<InformationTransferContent, 'scoring'>,
  atoms: readonly T[],
  lexicalWordIds: ReadonlySet<string>,
): T[] {
  return atoms.filter(
    (a) => a.atomType !== VOCABULARY_ATOM_TYPE || (ratesWords(ex) && lexicalWordIds.has(a.atomId)),
  );
}
