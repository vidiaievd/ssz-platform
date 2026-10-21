import { sampleFromSchema } from './schema-sample.js';

describe('sampleFromSchema', () => {
  it('prefers const, then the first enum value', () => {
    expect(sampleFromSchema({ const: 7 })).toBe(7);
    expect(sampleFromSchema({ type: 'string', enum: ['b', 'a'] })).toBe('b');
  });

  it('fills only required object properties', () => {
    expect(
      sampleFromSchema({
        type: 'object',
        required: ['a'],
        properties: { a: { type: 'boolean' }, b: { type: 'string' } },
      }),
    ).toEqual({ a: false });
  });

  it('respects minItems, minLength and minimum', () => {
    expect(sampleFromSchema({ type: 'array', minItems: 2, items: { type: 'integer', minimum: 3 } })).toEqual([3, 3]);
    expect((sampleFromSchema({ type: 'string', minLength: 9 }) as string).length).toBe(9);
    expect(sampleFromSchema({ type: 'number', exclusiveMinimum: 0 })).toBe(1);
  });

  it('produces a value for common string formats', () => {
    expect(sampleFromSchema({ type: 'string', format: 'date' })).toBe('2026-01-01');
    expect(sampleFromSchema({ type: 'string', format: 'uuid' })).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('picks the non-null type from a type list', () => {
    expect(sampleFromSchema({ type: ['null', 'string'] })).toBe('fake');
  });

  it('merges allOf parts', () => {
    expect(
      sampleFromSchema({
        allOf: [
          { type: 'object', required: ['a'], properties: { a: { const: 1 } } },
          { required: ['b'], properties: { b: { const: 2 } } },
        ],
      }),
    ).toEqual({ a: 1, b: 2 });
  });

  it('merges a typeless oneOf branch into its parent without turning it into an object', () => {
    expect(sampleFromSchema({ oneOf: [{ type: 'array', items: { type: 'string' } }] })).toEqual([]);
  });

  it('follows local $ref into $defs', () => {
    expect(
      sampleFromSchema({
        $defs: { item: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/item' },
      }),
    ).toEqual([{ id: 'fake' }]);
  });

  it('refuses a recursive $ref instead of looping', () => {
    expect(() =>
      sampleFromSchema({
        $defs: { node: { type: 'object', required: ['next'], properties: { next: { $ref: '#/$defs/node' } } } },
        $ref: '#/$defs/node',
      }),
    ).toThrow('too deep');
  });
});
