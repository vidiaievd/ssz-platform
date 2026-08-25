// Shared fixtures for the sentence_schema kernel tests.
//
// Built by hand rather than through the factories, so that ids are readable in a failure
// message and so a change to `newRow` cannot quietly change what every test is about.

import type { Chunk, Field, Row, Schema, SentenceSchemaContent } from './model.js';
import { CLAUSE_IDS, DEFAULT_SETTINGS } from './model.js';

export function field(id: string, short: string, label: string, optional = false): Field {
  return { id, short, label, hint: '', optional };
}

export function chunk(id: string, text: string, fieldId: string | null = null, alt: string[] = []): Chunk {
  return { id, text, field: fieldId, alt };
}

/** "I morgen | skal | jeg | ikke | lese | boka" — the handoff's own example sentence. */
export const MAIN_FIELDS: Field[] = [
  field('F', 'F', 'Forfelt', true),
  field('v', 'v', 'Finitt verbal'),
  field('n', 'n', 'Subjekt', true),
  field('a', 'a', 'Setningsadverbial', true),
  field('V', 'V', 'Infinitt verbal', true),
  field('N', 'N', 'Objekt', true),
];

export function schema(main: Field[] = MAIN_FIELDS): Schema {
  return CLAUSE_IDS.reduce((acc, clause) => {
    acc[clause] = clause === 'main' ? main : [];
    return acc;
  }, {} as Schema);
}

export function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    clause: 'main',
    text: 'I morgen skal jeg ikke lese boka',
    source: '',
    chunks: [
      chunk('c1', 'I morgen', 'F'),
      chunk('c2', 'skal', 'v'),
      chunk('c3', 'jeg', 'n'),
      chunk('c4', 'ikke', 'a'),
      chunk('c5', 'lese', 'V'),
      chunk('c6', 'boka', 'N'),
    ],
    extras: [],
    why: 'Det finitte verbet står på plass to.',
    fb: {},
    ...overrides,
  };
}

export function content(overrides: Partial<SentenceSchemaContent> = {}): SentenceSchemaContent {
  return {
    title: 'Ordstilling',
    instruction: 'Legg ordene i riktig felt.',
    presetId: 'nb-full',
    clauses: ['main'],
    schema: schema(),
    rows: [row()],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  };
}
