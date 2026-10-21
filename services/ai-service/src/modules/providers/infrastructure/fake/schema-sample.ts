type Schema = Record<string, unknown>;

/**
 * Builds the smallest value that satisfies a JSON Schema, so the `fake` adapter can answer
 * a structured request without knowing the agent behind it.
 *
 * Covers what agent and template schemas actually use: `const`, `enum`, `type` (one or a
 * list), required object properties, `minItems`, `minLength`, `minimum`, `oneOf` / `anyOf`
 * (first branch), `allOf` (merged), the common string `format`s and local `$ref` into `$defs` / `definitions`. Anything
 * fancier (`pattern`, `if/then`, `not`) is out of reach — a schema leaning on those gets an
 * answer `SchemaGuard` rejects, which is an honest outcome for a fake.
 */
export function sampleFromSchema(schema: Schema, root: Schema = schema, depth = 0): unknown {
  if (depth > 32) throw new Error('Schema nests too deep to sample (recursive $ref?)');

  if (typeof schema['$ref'] === 'string') {
    return sampleFromSchema(resolveRef(schema['$ref'], root), root, depth + 1);
  }
  if ('const' in schema) return schema['const'];
  if (Array.isArray(schema['enum']) && schema['enum'].length > 0) return schema['enum'][0];

  // The first branch is merged into its parent rather than sampled alone: template schemas
  // write `type: object, properties: {…}, anyOf: [{ required: [...] }]`, where the branch
  // only picks which properties are required and the parent says what they are.
  for (const key of ['oneOf', 'anyOf'] as const) {
    const branches = schema[key] as Schema[] | undefined;
    if (Array.isArray(branches) && branches.length > 0) {
      return sampleFromSchema(mergeSchemas(withoutKey(schema, key), branches[0]!), root, depth + 1);
    }
  }
  if (Array.isArray(schema['allOf'])) {
    const merged = (schema['allOf'] as Schema[]).reduce<Schema>(
      (acc, part) => mergeSchemas(acc, part),
      withoutKey(schema, 'allOf'),
    );
    return sampleFromSchema(merged, root, depth + 1);
  }

  const type = pickType(schema);
  switch (type) {
    case 'object': {
      const props = (schema['properties'] ?? {}) as Record<string, Schema>;
      const required = (schema['required'] ?? []) as string[];
      const out: Record<string, unknown> = {};
      for (const key of required) {
        out[key] = sampleFromSchema(props[key] ?? {}, root, depth + 1);
      }
      return out;
    }
    case 'array': {
      const count = typeof schema['minItems'] === 'number' ? schema['minItems'] : 0;
      const items = (schema['items'] ?? {}) as Schema;
      return Array.from({ length: count }, () => sampleFromSchema(items, root, depth + 1));
    }
    case 'string': {
      const format = typeof schema['format'] === 'string' ? FORMAT_SAMPLES[schema['format']] : undefined;
      if (format) return format;
      const min = typeof schema['minLength'] === 'number' ? schema['minLength'] : 0;
      return 'fake'.padEnd(Math.max(min, 4), 'x');
    }
    case 'integer':
    case 'number': {
      if (typeof schema['minimum'] === 'number') return Math.ceil(schema['minimum']);
      if (typeof schema['exclusiveMinimum'] === 'number') return Math.floor(schema['exclusiveMinimum']) + 1;
      if (typeof schema['maximum'] === 'number' && schema['maximum'] < 0) return Math.floor(schema['maximum']);
      return 0;
    }
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      return {};
  }
}

/** One valid value per `ajv-formats` format a schema is likely to use. */
const FORMAT_SAMPLES: Record<string, string> = {
  date: '2026-01-01',
  time: '00:00:00Z',
  'date-time': '2026-01-01T00:00:00Z',
  email: 'fake@example.com',
  uri: 'https://example.com/fake',
  url: 'https://example.com/fake',
  uuid: '00000000-0000-4000-8000-000000000000',
};

function pickType(schema: Schema): string | undefined {
  const type = schema['type'];
  if (Array.isArray(type)) return (type as string[]).find((t) => t !== 'null') ?? 'null';
  if (typeof type === 'string') return type;
  if (schema['properties'] || schema['required']) return 'object';
  if (schema['items']) return 'array';
  return undefined;
}

function resolveRef(ref: string, root: Schema): Schema {
  if (!ref.startsWith('#/')) throw new Error(`Only local $ref is supported, got "${ref}"`);
  let node: unknown = root;
  for (const segment of ref.slice(2).split('/')) {
    node = (node as Schema | undefined)?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  if (!node || typeof node !== 'object') throw new Error(`Unresolvable $ref "${ref}"`);
  return node as Schema;
}

function mergeSchemas(a: Schema, b: Schema): Schema {
  const merged: Schema = { ...a, ...b };
  // Only when either side has them — an empty `properties` would make a typeless branch
  // look like an object to `pickType`.
  if (a['properties'] || b['properties']) {
    merged['properties'] = { ...(a['properties'] as Schema), ...(b['properties'] as Schema) };
  }
  if (a['required'] || b['required']) {
    merged['required'] = [...((a['required'] as string[]) ?? []), ...((b['required'] as string[]) ?? [])];
  }
  return merged;
}

function withoutKey(schema: Schema, key: string): Schema {
  const { [key]: _omit, ...rest } = schema;
  return rest;
}
