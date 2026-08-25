// Language packs — seed data for a schema, not runtime behaviour.
//
// Source: SS_PRESETS in the handoff's data.jsx, ported field for field.
//
// A pack supplies one ordered field list per clause type. It is applied once, when the
// author picks it, and then forgotten: the schema inside the document is authoritative
// and may be edited past recognition. `content.presetId` records where it came from and
// nothing reads it back (model.ts, `presetId`).
//
// **These live in the kernel rather than behind an endpoint** (plan 52 §3.5, Q2). The
// handoff proposes `GET /exercise-types/sentence_schema/presets` so that a new language
// needs no client release; the platform has no such registry for any type, and what makes
// this exercise language-agnostic is the model — fields are data — not where four
// constants are stored. If adding packs without a release ever matters, the shape here
// moves to the content-service seed unchanged.

import { CLAUSE_IDS, type ClauseId, type Field, type Schema } from './model.js';

export interface Preset {
  id: string;
  /** "Norsk", "Deutsch", "Any language" — shown on the pack card. */
  lang: string;
  /** "Setningsskjema — fullt". */
  name: string;
  /** One line under the name. */
  desc: string;
  /** Called per selection so every application mints fresh field ids. */
  build: () => Schema;
}

/**
 * Field ids are minted per application, not written into the pack.
 *
 * Two exercises seeded from the same pack must not share field ids: ids are what
 * placements point at, and a shared id would make two documents look related to anything
 * that indexes by it. The `short` key is what stays stable and human-readable.
 */
let seq = 0;
function f(short: string, label: string, hint = '', optional = false): Field {
  seq += 1;
  return { id: `f${seq.toString(36)}`, short, label, hint, optional };
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'nb-full',
    lang: 'Norsk',
    name: 'Setningsskjema — fullt',
    desc: 'Seven fields, the standard Norwegian sentence chart.',
    build: () => ({
      main: [
        f('F', 'Forfelt', 'One element only — that is the V2 rule', true),
        f('v', 'Finitt verbal', 'The tensed verb'),
        f('n', 'Subjekt', '', true),
        f('a', 'Setningsadverbial', 'ikke, alltid, kanskje…', true),
        f('V', 'Infinitt verbal', 'Infinitive / participle', true),
        f('N', 'Objekt', '', true),
        f('A', 'Adverbial', 'Time, place, manner', true),
      ],
      sub: [
        f('k', 'Konjunksjon', 'at, fordi, hvis, som…'),
        f('n', 'Subjekt'),
        f('a', 'Setningsadverbial', 'Before the verb in a leddsetning', true),
        f('v', 'Finitt verbal'),
        f('V', 'Infinitt verbal', '', true),
        f('N', 'Objekt', '', true),
        f('A', 'Adverbial', '', true),
      ],
      yesno: [
        f('v', 'Finitt verbal', 'Question opens with the verb'),
        f('n', 'Subjekt'),
        f('a', 'Setningsadverbial', '', true),
        f('V', 'Infinitt verbal', '', true),
        f('N', 'Objekt', '', true),
        f('A', 'Adverbial', '', true),
      ],
      hv: [
        f('F', 'Spørreord', 'hva, hvem, hvor, hvorfor…'),
        f('v', 'Finitt verbal'),
        f('n', 'Subjekt', '', true),
        f('a', 'Setningsadverbial', '', true),
        f('V', 'Infinitt verbal', '', true),
        f('N', 'Objekt', '', true),
        f('A', 'Adverbial', '', true),
      ],
      imp: [
        f('v', 'Imperativ'),
        f('a', 'Setningsadverbial', '', true),
        f('N', 'Objekt', '', true),
        f('A', 'Adverbial', '', true),
      ],
    }),
  },
  {
    id: 'nb-simple',
    lang: 'Norsk',
    name: 'Setningsskjema — enkelt',
    desc: 'Four fields for A1–A2: first slot, verb, subject, rest.',
    build: () => ({
      main: [
        f('1', 'Forfelt', '', true),
        f('2', 'Verbal'),
        f('3', 'Subjekt', '', true),
        f('4', 'Resten', '', true),
      ],
      sub: [f('k', 'Konjunksjon'), f('1', 'Subjekt'), f('2', 'Verbal'), f('3', 'Resten', '', true)],
      yesno: [f('1', 'Verbal'), f('2', 'Subjekt'), f('3', 'Resten', '', true)],
      hv: [f('1', 'Spørreord'), f('2', 'Verbal'), f('3', 'Subjekt', '', true), f('4', 'Resten', '', true)],
      imp: [f('1', 'Verbal'), f('2', 'Resten', '', true)],
    }),
  },
  {
    id: 'de-topo',
    lang: 'Deutsch',
    name: 'Topologisches Feldermodell',
    desc: 'Vorfeld, Satzklammer, Mittelfeld, Nachfeld.',
    build: () => ({
      main: [
        f('VF', 'Vorfeld', 'Genau ein Element', true),
        f('LK', 'Linke Klammer', 'Finites Verb'),
        f('MF', 'Mittelfeld', '', true),
        f('RK', 'Rechte Klammer', 'Infinitiv, Partizip, Präfix', true),
        f('NF', 'Nachfeld', '', true),
      ],
      sub: [
        f('LK', 'Einleitung', 'dass, weil, wenn…'),
        f('MF', 'Mittelfeld', '', true),
        f('RK', 'Verbalkomplex'),
        f('NF', 'Nachfeld', '', true),
      ],
      yesno: [
        f('LK', 'Linke Klammer', 'Finites Verb zuerst'),
        f('MF', 'Mittelfeld', '', true),
        f('RK', 'Rechte Klammer', '', true),
        f('NF', 'Nachfeld', '', true),
      ],
      hv: [
        f('VF', 'Vorfeld', 'W-Wort'),
        f('LK', 'Linke Klammer'),
        f('MF', 'Mittelfeld', '', true),
        f('RK', 'Rechte Klammer', '', true),
        f('NF', 'Nachfeld', '', true),
      ],
      imp: [f('LK', 'Imperativ'), f('MF', 'Mittelfeld', '', true), f('RK', 'Rechte Klammer', '', true)],
    }),
  },
  {
    id: 'blank',
    lang: 'Any language',
    name: 'Tomt skjema',
    desc: 'Three unnamed fields — name them yourself.',
    build: () => ({
      main: [f('1', 'Field 1'), f('2', 'Field 2'), f('3', 'Field 3', '', true)],
      sub: [f('1', 'Field 1'), f('2', 'Field 2'), f('3', 'Field 3', '', true)],
      yesno: [f('1', 'Field 1'), f('2', 'Field 2', '', true)],
      hv: [f('1', 'Field 1'), f('2', 'Field 2', '', true)],
      imp: [f('1', 'Field 1'), f('2', 'Field 2', '', true)],
    }),
  },
];

/** The named pack, or the first one. Never throws: `presetId` is provenance, not a key. */
export function preset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
}

/** An empty schema — every clause type present, none with fields. */
export function emptySchema(): Schema {
  return CLAUSE_IDS.reduce((acc, clause) => {
    acc[clause] = [];
    return acc;
  }, {} as Record<ClauseId, Field[]>);
}
