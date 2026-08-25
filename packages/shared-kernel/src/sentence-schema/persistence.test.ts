// The security boundary, and the coercion that keeps a JSON column from throwing.
//
// The first describe is the test plan 52 §3.2 exists for: the key — including `row.text`,
// which the handoff's Security section omits — must not be reachable from `content`.

import { describe, expect, it } from 'vitest';

import { chunk, content, row } from './fixtures.test-support.js';
import {
  fromPersisted,
  isSentenceSchemaDocument,
  readAnswers,
  readContent,
  toContent,
  toExpectedAnswers,
} from './persistence.js';
import { DEFAULT_SETTINGS } from './model.js';

describe('toContent — what a student may receive', () => {
  const ex = content({
    rows: [row({ source: 'Jeg skal lese boka i morgen', fb: { c1: 'Fronted adverbial.' } })],
  });
  const stored = toContent(ex);
  const serialised = JSON.stringify(stored);

  it('carries the chunk texts — they are the bank', () => {
    expect(stored.rows[0]!.chunks.map((c) => c.text)).toEqual([
      'I morgen',
      'skal',
      'jeg',
      'ikke',
      'lese',
      'boka',
    ]);
  });

  it('carries no field, no alt, no fb and no why', () => {
    expect(serialised).not.toContain('"field"');
    expect(serialised).not.toContain('"alt"');
    expect(serialised).not.toContain('Fronted adverbial');
    expect(serialised).not.toContain('Det finitte verbet');
  });

  it('carries no row text — that is the word order, written out', () => {
    expect(serialised).not.toContain('I morgen skal jeg ikke lese boka');
    expect(stored.rows[0]).not.toHaveProperty('text');
  });

  it('does carry the source sentence — it is the prompt, not the answer', () => {
    expect(stored.rows[0]!.source).toBe('Jeg skal lese boka i morgen');
  });
});

describe('toExpectedAnswers', () => {
  it('keys the answer by row id, so reordering cannot shuffle it', () => {
    const ex = content({ rows: [row({ id: 'alpha' })] });

    expect(Object.keys(toExpectedAnswers(ex).rows)).toEqual(['alpha']);
  });

  it('writes a field per chunk and alts only where there are any', () => {
    const ex = content({ rows: [row({ chunks: [chunk('c1', 'I morgen', 'F', ['A']), chunk('c2', 'skal', 'v')] })] });
    const key = toExpectedAnswers(ex).rows['r1']!;

    expect(key.fields).toEqual({ c1: 'F', c2: 'v' });
    expect(key.alt).toEqual({ c1: ['A'] });
  });
});

describe('round trip', () => {
  it('returns the document it was given', () => {
    const ex = content({ rows: [row({ source: 'Jeg leser boka', fb: { c2: 'Verb second.' } })] });

    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });
});

describe('fromPersisted — a column may be anything', () => {
  it('survives null on both sides', () => {
    const ex = fromPersisted(null, null);

    expect(ex.rows).toEqual([]);
    expect(ex.settings).toEqual(DEFAULT_SETTINGS);
    expect(ex.clauses).toEqual([]);
  });

  it('shows the work when the key is missing rather than blanking the row', () => {
    const ex = content();
    const restored = fromPersisted(toContent(ex), null);

    expect(restored.rows[0]!.text).toBe('I morgen skal jeg ikke lese boka');
    expect(restored.rows[0]!.chunks.every((c) => c.field === null)).toBe(true);
    expect(restored.rows[0]!.why).toBe('');
  });

  it('falls back to a known clause and a known settings value', () => {
    const restored = readContent({
      rows: [{ id: 'r1', clause: 'nonsense', chunks: [], extras: [] }],
      settings: { order: 'whatever', prefill: 7 },
    });

    expect(restored.rows[0]!.clause).toBe('main');
    expect(restored.settings.order).toBe('strict');
    expect(restored.settings.prefill).toBe('none');
  });

  it('lists clause types in the rail’s order, not the document’s', () => {
    expect(readContent({ clauses: ['imp', 'main', 'sub'] }).clauses).toEqual(['main', 'sub', 'imp']);
  });

  it('drops a field map entry that is not a string, keeping the chunk unplaced', () => {
    const answers = readAnswers({ rows: { r1: { fields: { c1: 42 }, alt: { c1: ['A', 7] } } } });

    expect(answers.rows['r1']!.fields['c1']).toBeNull();
    expect(answers.rows['r1']!.alt['c1']).toEqual(['A']);
  });
});

describe('isSentenceSchemaDocument', () => {
  it('recognises the new form by its rows, even when empty', () => {
    expect(isSentenceSchemaDocument({ rows: [] })).toBe(true);
    expect(isSentenceSchemaDocument(toContent(content()))).toBe(true);
  });

  it('rejects the old form and anything else', () => {
    // The six exercises that stay on the old shape (plan 52 §8 Q3).
    expect(isSentenceSchemaDocument({ sentence: '… at han ikke hadde tatt fagbrevet ennå.', fields: [], tokens: [] })).toBe(false);
    expect(isSentenceSchemaDocument(null)).toBe(false);
    expect(isSentenceSchemaDocument('rows')).toBe(false);
  });
});
