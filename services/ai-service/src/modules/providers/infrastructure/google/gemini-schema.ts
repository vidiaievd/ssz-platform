/**
 * JSON Schema → the subset Gemini accepts in `responseJsonSchema`.
 *
 * Gemini enforces only a listed subset of keywords and rejects or ignores the rest. The
 * downgrade sorts every keyword into one of three bins:
 *
 *  - **kept** — part of Gemini's subset, passed through (sub-schemas rewritten in turn);
 *  - **dropped** — annotations, and constraints that only narrow an already-typed value
 *    (`minLength`, `pattern`, …). Dropping them loosens what Gemini enforces, never the
 *    shape, and `SchemaGuard` checks the answer against the original schema anyway — the
 *    same trade the Anthropic strict rewrite makes;
 *  - **lossy** — constructs that decide the *shape* (`allOf`, `not`, `if`, a typeless
 *    `anyOf` branch, …). Gemini cannot be told about them without changing what a valid
 *    answer looks like, so the whole schema goes to `json_mode` instead.
 *
 * A few keywords are rewritten into the subset without loss: `type: [T, 'null']` and an
 * `enum` holding `null` become an `anyOf` with a `{ type: 'null' }` branch, `const` becomes
 * a one-value `enum`, `oneOf` becomes `anyOf` (exclusivity is left to `SchemaGuard`). A
 * boolean `const` / `enum` on a `type: 'boolean'` node only narrows, so it is dropped.
 */

type Json = Record<string, unknown>;

export type GeminiSchemaResult =
  | { ok: true; schema: Json; loosened: string[] }
  | { ok: false; reasons: string[] };

/** Gemini's documented `responseJsonSchema` subset. */
const SUPPORTED = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

/** Carry no constraint at all. */
const ANNOTATIONS = new Set([
  '$schema',
  '$comment',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'contentMediaType',
  'contentEncoding',
]);

/** Narrow a value whose type Gemini still enforces; `SchemaGuard` checks them. */
const NARROWING = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'uniqueItems',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minProperties',
  'maxProperties',
]);

/** Keywords whose value is a map of sub-schemas. */
const SCHEMA_MAPS = new Set(['properties', '$defs']);
/** Keywords whose value is a list of sub-schemas. */
const SCHEMA_LISTS = new Set(['anyOf', 'oneOf', 'prefixItems']);

export function toGeminiSchema(schema: Json): GeminiSchemaResult {
  const ctx: Ctx = { reasons: [], loosened: [] };
  const out = rewrite(schema, '#', ctx);
  return ctx.reasons.length > 0
    ? { ok: false, reasons: ctx.reasons }
    : { ok: true, schema: out, loosened: ctx.loosened };
}

interface Ctx {
  reasons: string[];
  loosened: string[];
}

function rewrite(input: Json, path: string, ctx: Ctx): Json {
  const node = { ...input };

  if ('const' in node) {
    const value = node['const'];
    delete node['const'];
    if (value === null) node['type'] = 'null';
    else if (isEnumValue(value)) node['enum'] = [value];
    else if (typeof value === 'boolean' && node['type'] === 'boolean') ctx.loosened.push(`${path}/const`);
    else ctx.reasons.push(`${path}: const of type ${typeof value}`);
  }
  // Gemini's enum takes strings and numbers only. On a typed boolean it only narrows.
  if (node['type'] === 'boolean' && Array.isArray(node['enum'])) {
    delete node['enum'];
    ctx.loosened.push(`${path}/enum`);
  }

  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    const at = `${path}/${key}`;
    if (ANNOTATIONS.has(key)) continue;
    if (NARROWING.has(key)) {
      ctx.loosened.push(at);
      continue;
    }
    if (!SUPPORTED.has(key)) {
      ctx.reasons.push(`${at}: not supported`);
      continue;
    }

    if (SCHEMA_MAPS.has(key)) {
      out[key] = Object.fromEntries(
        Object.entries(value as Json).map(([name, sub]) => [name, rewriteSub(sub, `${at}/${name}`, ctx)]),
      );
    } else if (SCHEMA_LISTS.has(key)) {
      const list = (value as unknown[]).map((sub, i) => rewriteSub(sub, `${at}/${i}`, ctx));
      if (key !== 'prefixItems') {
        list.forEach((branch, i) => {
          if (typeof branch === 'object' && !('type' in branch) && !('$ref' in branch) && !('anyOf' in branch)) {
            ctx.reasons.push(`${at}/${i}: anyOf branch without a type`);
          }
        });
      }
      // Gemini reads `oneOf` as `anyOf`; spell it that way so nobody expects exclusivity.
      const target = key === 'oneOf' ? 'anyOf' : key;
      if (target in out) ctx.reasons.push(`${at}: both anyOf and oneOf`);
      out[target] = list;
    } else if (key === 'items') {
      if (Array.isArray(value)) ctx.reasons.push(`${at}: tuple form of items`);
      else out[key] = rewriteSub(value, at, ctx);
    } else if (key === 'additionalProperties') {
      out[key] = typeof value === 'boolean' ? value : rewriteSub(value, at, ctx);
    } else {
      out[key] = value;
    }
  }

  if ('$ref' in out) {
    const siblings = Object.keys(out).filter((k) => !k.startsWith('$'));
    if (siblings.length > 0) ctx.reasons.push(`${path}: $ref next to ${siblings.join(', ')}`);
  }

  return splitNullable(out, path, ctx);
}

function rewriteSub(value: unknown, path: string, ctx: Ctx): Json {
  if (typeof value === 'boolean') {
    ctx.reasons.push(`${path}: boolean schema`);
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    ctx.reasons.push(`${path}: not a schema`);
    return {};
  }
  return rewrite(value as Json, path, ctx);
}

/**
 * `type: ['string', 'null']` and `enum: ['a', null]` → `anyOf` over the types, with `null`
 * as its own branch. A multi-type node keeps its title and description; every other
 * keyword moves into each typed branch, where Gemini ignores the ones that do not apply.
 */
function splitNullable(node: Json, path: string, ctx: Ctx): Json {
  const types = Array.isArray(node['type']) ? (node['type'] as string[]) : undefined;
  const enumValues = Array.isArray(node['enum']) ? (node['enum'] as unknown[]) : undefined;

  const badEnum = enumValues?.filter((v) => v !== null && !isEnumValue(v));
  if (badEnum && badEnum.length > 0) {
    ctx.reasons.push(`${path}/enum: values that are neither strings nor numbers`);
    return node;
  }
  const enumHasNull = enumValues?.includes(null) ?? false;
  if (!types && !enumHasNull) return node;

  const { title, description, type: _type, enum: _enum, ...rest } = node;
  const nonNullEnum = enumValues?.filter((v) => v !== null);
  const branchTypes = (types ?? (typeof node['type'] === 'string' ? [node['type'] as string] : [])).filter(
    (t) => t !== 'null',
  );
  // A single non-null `type` already rules null out, whatever the enum lists.
  const allowsNull = types ? types.includes('null') : node['type'] === undefined && enumHasNull;

  const branches: Json[] = [];
  if (branchTypes.length === 0 && nonNullEnum && nonNullEnum.length > 0) {
    // An untyped enum mixing null with values: type the branch from the values.
    branches.push({ ...rest, enum: nonNullEnum });
  }
  for (const t of branchTypes) {
    const branch: Json = { ...rest, type: t };
    if (nonNullEnum) {
      const fitting = nonNullEnum.filter((v) => fitsType(v, t));
      if (fitting.length === 0) continue;
      branch['enum'] = fitting;
    }
    branches.push(branch);
  }
  if (allowsNull && (!enumValues || enumHasNull)) branches.push({ type: 'null' });

  if (branches.length === 1) {
    return { ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}), ...branches[0] };
  }
  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    anyOf: branches,
  };
}

function isEnumValue(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

function fitsType(value: unknown, type: string): boolean {
  if (type === 'string') return typeof value === 'string';
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number';
  return false;
}
