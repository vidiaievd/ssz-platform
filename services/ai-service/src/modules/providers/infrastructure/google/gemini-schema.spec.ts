import Ajv from 'ajv';
import { toGeminiSchema } from './gemini-schema.js';
import {
  errorCorrectionAnswerSchema,
  errorCorrectionContentSchema,
  translateAnswerSchema,
  translateContentSchema,
  writingTaskAnswerSchema,
  writingTaskContentSchema,
} from '../template-schemas.fixture.js';

type Json = Record<string, unknown>;

const SUPPORTED = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items',
  'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties',
  'additionalProperties', 'required', 'propertyOrdering',
]);

/** Every keyword anywhere in the schema, with where it sits. */
function keywords(schema: unknown, path = '#'): Array<[string, string]> {
  if (typeof schema !== 'object' || schema === null) return [];
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(schema as Json)) {
    out.push([key, path]);
    if (key === 'properties' || key === '$defs') {
      for (const [name, sub] of Object.entries(value as Json)) out.push(...keywords(sub, `${path}/${key}/${name}`));
    } else if (Array.isArray(value)) {
      value.forEach((sub, i) => out.push(...keywords(sub, `${path}/${key}/${i}`)));
    } else if (key === 'items' || key === 'additionalProperties') {
      out.push(...keywords(value, `${path}/${key}`));
    }
  }
  return out;
}

/** Whether `schema` accepts `data` — the downgrade must never reject what the original accepts. */
const ajv = new (Ajv as any)({ strict: false });
const accepts = (schema: Json, data: unknown): boolean => ajv.validate(schema, data);

describe('toGeminiSchema on real template schemas', () => {
  it.each([
    ['translate (content)', translateContentSchema],
    ['translate (answer)', translateAnswerSchema],
    ['error_correction (content)', errorCorrectionContentSchema],
    ['error_correction (answer)', errorCorrectionAnswerSchema],
    ['writing_task (content)', writingTaskContentSchema],
    ['writing_task (answer)', writingTaskAnswerSchema],
  ] as const)('%s downgrades to native without losing its shape', (_name, schema) => {
    const result = toGeminiSchema(schema as Json);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    const unsupported = keywords(result.schema).filter(([key]) => !SUPPORTED.has(key));
    expect(unsupported).toEqual([]);
    // No `type` array survives: Gemini gets one type per node.
    expect(JSON.stringify(result.schema)).not.toMatch(/"type":\[/);
  });

  it('translate: `default` goes, the nullable replay limit becomes an anyOf with a null branch', () => {
    const result = toGeminiSchema(translateContentSchema as Json);
    if (!result.ok) throw new Error(result.reasons.join('; '));
    const props = result.schema['properties'] as Json;

    expect(props['dir']).toEqual({
      type: 'string',
      enum: ['to_target', 'from_target', 'both'],
      description: 'Which way the set is translated; "both" is a mixed set',
    });
    const flow = (props['flow'] as Json)['properties'] as Json;
    expect(flow['replayLimit']).toEqual({ anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] });
    // The nested audio layer's nullable object keeps its description on the outside.
    const audio = (props['audio'] as Json)['properties'] as Json;
    expect(audio['lessonRef']).toEqual({
      description: 'source=lesson: the narration this clip borrows, by reference',
      anyOf: [
        { type: 'object', properties: { lessonId: { type: 'string' }, variant: { type: 'string' } } },
        { type: 'null' },
      ],
    });
  });

  it('writing_task: the nullable metric enum keeps its values and gains a null branch', () => {
    const result = toGeminiSchema(writingTaskContentSchema as Json);
    if (!result.ok) throw new Error(result.reasons.join('; '));
    const rubric = (result.schema['properties'] as Json)['rubric'] as Json;
    const metric = ((rubric['items'] as Json)['properties'] as Json)['metric'];
    expect(metric).toEqual({
      anyOf: [{ type: 'string', enum: ['points', 'paragraphs', 'language', 'lexis'] }, { type: 'null' }],
    });
  });

  it('writing_task (answer): map-shaped additionalProperties and minItems/maxItems are kept', () => {
    const result = toGeminiSchema(writingTaskAnswerSchema as Json);
    if (!result.ok) throw new Error(result.reasons.join('; '));
    const rubric = (result.schema['properties'] as Json)['rubric'] as Json;
    expect((rubric['additionalProperties'] as Json)['properties']).toEqual({
      levels: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
    });
  });

  it('error_correction (answer): nothing needs rewriting, so the schema comes back equal', () => {
    const result = toGeminiSchema(errorCorrectionAnswerSchema as Json);
    expect(result).toEqual({ ok: true, schema: errorCorrectionAnswerSchema, loosened: [] });
  });

  it.each([
    ['translate', translateContentSchema, { items: [{ id: 'a', source: 'Hei' }], flow: { replayLimit: null }, audio: { lessonRef: null } }],
    ['writing_task', writingTaskContentSchema, {
      mode: 'essay', prompt: 'p', points: [], settings: { minWords: 0, maxWords: 0, passScore: 3 },
      rubric: [{ id: 'r', name: 'n', metric: null }, { id: 's', name: 'm', metric: 'lexis', weight: 2 }],
    }],
  ] as const)('%s: a document the original accepts, the downgrade accepts too', (_name, schema, doc) => {
    const result = toGeminiSchema(schema as Json);
    if (!result.ok) throw new Error(result.reasons.join('; '));
    expect(accepts(schema as Json, doc)).toBe(true);
    expect(accepts(result.schema, doc)).toBe(true);
  });
});

describe('toGeminiSchema rules', () => {
  it('drops narrowing constraints and reports them as loosened', () => {
    const result = toGeminiSchema({
      type: 'object',
      properties: { code: { type: 'string', minLength: 2, maxLength: 5, pattern: '^[a-z]+$' }, tags: { type: 'array', uniqueItems: true, items: { type: 'string' } } },
    });
    expect(result).toEqual({
      ok: true,
      schema: { type: 'object', properties: { code: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } },
      loosened: ['#/properties/code/minLength', '#/properties/code/maxLength', '#/properties/code/pattern', '#/properties/tags/uniqueItems'],
    });
  });

  it('const becomes a one-value enum; oneOf becomes anyOf', () => {
    const result = toGeminiSchema({
      oneOf: [{ type: 'object', properties: { kind: { const: 'a' } } }, { type: 'string' }],
    });
    expect(result).toEqual({
      ok: true,
      schema: { anyOf: [{ type: 'object', properties: { kind: { enum: ['a'] } } }, { type: 'string' }] },
      loosened: [],
    });
  });

  it('a template-style anyOf of typeless `required` branches cannot be expressed', () => {
    const result = toGeminiSchema({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      anyOf: [{ required: ['a'] }, { required: ['b'] }],
    });
    expect(result).toEqual({
      ok: false,
      reasons: ['#/anyOf/0: anyOf branch without a type', '#/anyOf/1: anyOf branch without a type'],
    });
  });

  it.each([
    ['allOf', { allOf: [{ type: 'string' }] }],
    ['not', { not: { type: 'null' } }],
    ['if/then', { type: 'object', if: { required: ['a'] }, then: { required: ['b'] } }],
    ['patternProperties', { type: 'object', patternProperties: { '^x': { type: 'string' } } }],
    ['tuple items', { type: 'array', items: [{ type: 'string' }] }],
    ['boolean enum', { enum: [true, false] }],
    ['$ref with siblings', { $ref: '#/$defs/x', type: 'object' }],
  ])('%s is lossy', (_name, schema) => {
    expect(toGeminiSchema(schema as Json).ok).toBe(false);
  });

  it('a boolean const or enum on a typed boolean only narrows — the test-model schema stays native', () => {
    expect(
      toGeminiSchema({
        type: 'object',
        required: ['ok', 'echo'],
        additionalProperties: false,
        properties: { ok: { type: 'boolean', const: true }, echo: { type: 'string', enum: ['pong'] }, b: { type: 'boolean', enum: [false] } },
      }),
    ).toEqual({
      ok: true,
      schema: {
        type: 'object',
        required: ['ok', 'echo'],
        additionalProperties: false,
        properties: { ok: { type: 'boolean' }, echo: { type: 'string', enum: ['pong'] }, b: { type: 'boolean' } },
      },
      loosened: ['#/properties/ok/const', '#/properties/b/enum'],
    });
    expect(toGeminiSchema({ const: true }).ok).toBe(false);
  });

  it('a single type with null in its enum just loses the null — the type already forbids it', () => {
    expect(toGeminiSchema({ type: 'string', enum: ['a', null] })).toEqual({
      ok: true,
      schema: { type: 'string', enum: ['a'] },
      loosened: [],
    });
  });

  it('does not mutate its input', () => {
    const input = { type: ['string', 'null'], default: 'x' };
    const copy = structuredClone(input);
    toGeminiSchema(input);
    expect(input).toEqual(copy);
  });
});
