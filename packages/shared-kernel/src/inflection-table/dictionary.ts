// Rows from the course dictionary — `itRowFrom` of the handoff, over the platform's dictionary.
//
// DECISIONS §3: pulled on request, never automatically, and the pulled forms are
// **suggestions**. The dictionary's forms are generated for the common case; `bok → bøker` and
// `søster → søstre` are exactly the rows worth asking and exactly the rows a generator gets
// wrong. So every asked cell arrives with a value and still needs the author's eye — a key and
// a reason are blockers whatever was suggested.
//
// The entry is what content-service returns for `GET /exercises/:id/dictionary` (plan 69
// §3.8): a `vocabulary_items` row with its `grammaticalProperties`. How a property becomes a
// cell is the pack's data (`Slot.dict`, `Paradigm.lemma`), not this file's — spelling the
// forms here, once, keeps the builder and its tests on one function.

import type { Paradigm, ParadigmPack, Slot } from './packs.js';
import type { Cell, Row } from './model.js';
import { newCell, newId } from './model.js';

export interface DictionaryEntry {
  /** `vocabulary_items.id` — becomes the row's `dictId`. */
  id: string;
  /** The dictionary word, as stored: no article, no infinitive mark (`søknad`, `søke`). */
  word: string;
  /** `PartOfSpeech` enum name. */
  pos: string;
  /** Meaning in the author's language. */
  gloss: string;
  /** Where in the course the word is introduced — the picker's provenance line. */
  unit: string;
  /** `grammaticalProperties`: `gender`, `definite_singular`, `past_tense`, … */
  properties: Readonly<Record<string, unknown>>;
}

/** The row's lemma: the word with the article its gender takes, or the infinitive mark. */
export function lemmaOf(entry: DictionaryEntry, pack: ParadigmPack, paradigm: Paradigm): string {
  return render(paradigm.lemma, entry, pack) ?? bare(entry.word, pack);
}

/** The suggested form for one slot; empty where the dictionary has nothing for it. */
export function suggestedForm(entry: DictionaryEntry, pack: ParadigmPack, slot: Slot): string {
  if (slot.dict === undefined) return '';
  return render(slot.dict, entry, pack) ?? '';
}

/**
 * A new row from a dictionary entry, over the slots in play: the first slot given, the rest
 * asked — the prototype's default, which «First column given» restores in bulk.
 */
export function fromDictionary(
  entry: DictionaryEntry,
  pack: ParadigmPack,
  paradigm: Paradigm,
  slots: readonly Slot[],
): Row {
  const cells: Record<string, Cell> = {};
  slots.forEach((slot, index) => {
    cells[slot.id] = newCell(suggestedForm(entry, pack, slot), index === 0 ? 'prefill' : 'ask');
  });
  return {
    id: newId(),
    lemma: lemmaOf(entry, pack, paradigm),
    gloss: entry.gloss,
    dictId: entry.id,
    cells,
  };
}

/** The entries the picker lists for a paradigm: its part of speech, matching the search. */
export function entriesFor(
  entries: readonly DictionaryEntry[],
  paradigm: Paradigm,
  query = '',
): DictionaryEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (e) => e.pos === paradigm.pos && (q === '' || `${e.word} ${e.gloss}`.toLowerCase().includes(q)),
  );
}

/**
 * Fill a pattern from an entry. `null` when a property it names is missing — a half-spelt
 * form (`har ` with no participle) is worse than an empty suggestion. A missing article is not
 * fatal: the word is still the lemma, only without its gender.
 */
function render(pattern: string, entry: DictionaryEntry, pack: ParadigmPack): string | null {
  let missing = false;
  const out = pattern.replace(/\{(w|a|p:([a-z_]+))\}/g, (_all, token: string, prop?: string) => {
    if (token === 'w') return bare(entry.word, pack);
    if (token === 'a') {
      const gender = entry.properties['gender'];
      return typeof gender === 'string' ? (pack.articles[gender] ?? '') : '';
    }
    const value = entry.properties[prop ?? ''];
    if (typeof value !== 'string' || value.trim() === '') {
      missing = true;
      return '';
    }
    return value.trim();
  });
  return missing ? null : out.trim().replace(/\s+/g, ' ');
}

/** The word without a leading article or infinitive mark, should the dictionary carry one. */
export function bare(word: string, pack: ParadigmPack): string {
  const text = word.trim();
  for (const particle of pack.particles) {
    if (text.toLowerCase().startsWith(`${particle} `))
      return text.slice(particle.length + 1).trim();
  }
  return text;
}
