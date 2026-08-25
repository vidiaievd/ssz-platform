// IMPLEMENTATION.md: "`ssParseBulk`: `sub ::` prefix, empty segment, more segments than
// fields (extra segments must not create phantom fields)."

import { describe, expect, it } from 'vitest';

import { field, MAIN_FIELDS, schema } from './fixtures.test-support.js';
import { applyBulk, parseBulk } from './bulk.js';
import { newRow } from './model.js';

const SUB_FIELDS = [
  field('k', 'k', 'Konjunksjon'),
  field('n2', 'n', 'Subjekt'),
  field('a2', 'a', 'Setningsadverbial', true),
  field('v2', 'v', 'Finitt verbal'),
];

const options = { schema: { ...schema(MAIN_FIELDS), sub: SUB_FIELDS }, defaultClause: 'main' as const };

describe('parseBulk', () => {
  it('maps segments onto fields in schema order', () => {
    const [parsed] = parseBulk('I morgen | skal | jeg | ikke | lese | boka', options);

    expect(parsed!.text).toBe('I morgen skal jeg ikke lese boka');
    // "I morgen" is two words and so two chunks: joining them is the author's call, made
    // on the chunk strip. The paste places both in the same field, which is the claim.
    expect(parsed!.chunks.map((c) => [c.text, c.field])).toEqual([
      ['I', 'F'],
      ['morgen', 'F'],
      ['skal', 'v'],
      ['jeg', 'n'],
      ['ikke', 'a'],
      ['lese', 'V'],
      ['boka', 'N'],
    ]);
  });

  it('reads a clause prefix and uses that clause’s fields', () => {
    const [parsed] = parseBulk('sub :: fordi | jeg | ikke | hadde', options);

    expect(parsed!.clause).toBe('sub');
    expect(parsed!.chunks.map((c) => c.field)).toEqual(['k', 'n2', 'a2', 'v2']);
  });

  it('ignores a prefix that is not a clause type', () => {
    const [parsed] = parseBulk('foo :: jeg | leser', options);

    expect(parsed!.clause).toBe('main');
    expect(parsed!.chunks[0]!.text).toBe('foo');
  });

  it('leaves a field empty without shifting the ones after it', () => {
    const [parsed] = parseBulk('sub :: fordi | jeg | | hadde', options);

    expect(parsed!.chunks.map((c) => [c.text, c.field])).toEqual([
      ['fordi', 'k'],
      ['jeg', 'n2'],
      ['hadde', 'v2'],
    ]);
  });

  it('leaves surplus segments unplaced instead of inventing fields', () => {
    const [parsed] = parseBulk('a | b | c | d | e | f | g | h', options);

    expect(parsed!.chunks).toHaveLength(8);
    expect(parsed!.chunks.slice(0, 6).every((c) => c.field !== null)).toBe(true);
    expect(parsed!.chunks.slice(6).every((c) => c.field === null)).toBe(true);
  });

  it('skips blank lines and parses several sentences', () => {
    const parsed = parseBulk('jeg | leser\n\nsub :: at | han\n   \n', options);

    expect(parsed).toHaveLength(2);
    expect(parsed.map((r) => r.clause)).toEqual(['main', 'sub']);
  });

  it('mints a distinct id per row and per chunk', () => {
    const parsed = parseBulk('jeg | leser\njeg | leser', options);
    const ids = parsed.flatMap((r) => [r.id, ...r.chunks.map((c) => c.id)]);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('applyBulk', () => {
  it('drops the empty placeholder row a builder starts with', () => {
    const parsed = parseBulk('jeg | leser', options);
    const applied = applyBulk([newRow()], parsed);

    expect(applied).toHaveLength(1);
    expect(applied[0]!.text).toBe('jeg leser');
  });

  it('keeps rows that already have text', () => {
    const existing = [{ ...newRow(), text: 'Jeg leser boka' }];
    const applied = applyBulk(existing, parseBulk('sub :: at | han', options));

    expect(applied.map((r) => r.text)).toEqual(['Jeg leser boka', 'at han']);
  });
});
