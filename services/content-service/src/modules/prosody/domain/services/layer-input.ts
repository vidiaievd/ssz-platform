// The layer an editor sends (plan 86, step 6h.2b), read field by field into a kernel
// `ProsodyLayer`. Only the shape is judged here — whether the anchors lie on the text is
// `prosodyIssues`' job, after this. Unknown fields are dropped, never stored: the column is
// read back without re-validation.
//
// An authored layer holds only what an author set: a word stress with source `lexicon` is
// refused — the lexicon's words are recomputed per text and merged on read, a stored copy
// would outlive a lexicon fix.

import { TOKENIZER_ID } from '@ssz/shared-kernel/text';
import type {
  GroupBoundary,
  PhraseAccent,
  PhraseSource,
  ProsodyAnchor,
  ProsodyElement,
  ProsodyLayer,
  WordLink,
  WordStress,
  WordUnstressed,
} from '@ssz/shared-kernel/prosody';
import { layerOf } from '@ssz/shared-kernel/prosody';

export type LayerInput = { ok: true; layer: ProsodyLayer } | { ok: false; errors: string[] };

const SOURCES: ReadonlySet<string> = new Set(['teacher', 'ai']);
const PITCHES: ReadonlySet<string> = new Set(['rise', 'fall', 'level']);
const PAUSES: ReadonlySet<string> = new Set(['short', 'long']);
const LISTS = ['stresses', 'unstressed', 'accents', 'boundaries', 'links'] as const;
const KIND_OF_LIST = {
  stresses: 'stress',
  unstressed: 'unstressed',
  accents: 'accent',
  boundaries: 'boundary',
  links: 'link',
} as const;
type Kind = ProsodyElement['kind'];

const KINDS: Record<Kind, true> = {
  stress: true,
  unstressed: true,
  accent: true,
  boundary: true,
  link: true,
};

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isIndex = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

export function readLayerInput(raw: unknown): LayerInput {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['layer: not an object'] };
  if (raw.tokenizer !== TOKENIZER_ID) errors.push(`layer.tokenizer: not ${TOKENIZER_ID}`);

  const elements: ProsodyElement[] = [];
  for (const list of LISTS) {
    const value = raw[list];
    // `unstressed` is optional in the kernel (layers saved before step 6h); the rest are not.
    if (value === undefined && list === 'unstressed') continue;
    if (!Array.isArray(value)) {
      errors.push(`layer.${list}: not an array`);
      continue;
    }
    value.forEach((x, k) => {
      const el = readElement(KIND_OF_LIST[list], x, `layer.${list}[${k}]`, errors);
      if (el) elements.push(el);
    });
  }

  const orphans: ProsodyElement[] = [];
  if (!Array.isArray(raw.orphans)) errors.push('layer.orphans: not an array');
  else
    raw.orphans.forEach((x, k) => {
      const path = `layer.orphans[${k}]`;
      if (!isObject(x) || typeof x.kind !== 'string' || !(x.kind in KINDS)) {
        errors.push(`${path}.kind: unknown`);
        return;
      }
      const el = readElement(x.kind as Kind, x.mark, `${path}.mark`, errors);
      if (el) orphans.push(el);
    });

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, layer: layerOf(elements, orphans) };
}

function readElement(
  kind: Kind,
  x: unknown,
  path: string,
  errors: string[],
): ProsodyElement | null {
  const before = errors.length;
  if (!isObject(x)) {
    errors.push(`${path}: not an object`);
    return null;
  }
  if (!isIndex(x.i)) errors.push(`${path}.i: not a token index`);
  if (typeof x.w !== 'string' || x.w.trim() === '') errors.push(`${path}.w: not a word`);
  if (typeof x.source !== 'string' || !SOURCES.has(x.source))
    errors.push(`${path}.source: not teacher or ai`);
  const anchor = { i: x.i as number, w: x.w as string, source: x.source as PhraseSource };

  if (kind === 'stress') {
    const v = x.vowel;
    if (x.toneme !== 1 && x.toneme !== 2 && x.toneme !== null)
      errors.push(`${path}.toneme: not 1, 2 or null`);
    if (!isObject(v) || !isIndex(v.s) || !isIndex(v.e) || v.e <= v.s)
      errors.push(`${path}.vowel: not [s, e) in the word`);
    else if (v.long !== true && v.long !== false && v.long !== null)
      errors.push(`${path}.vowel.long: not a boolean or null`);
    if (errors.length > before) return null;
    const vowel = v as { s: number; e: number; long: boolean | null };
    const mark: WordStress = {
      ...anchor,
      toneme: x.toneme as 1 | 2 | null,
      vowel: { s: vowel.s, e: vowel.e, long: vowel.long },
    };
    return { kind, mark };
  }
  if (kind === 'boundary') {
    if (x.pitch !== null && !(typeof x.pitch === 'string' && PITCHES.has(x.pitch)))
      errors.push(`${path}.pitch: not rise, fall, level or null`);
    if (x.pause !== null && !(typeof x.pause === 'string' && PAUSES.has(x.pause)))
      errors.push(`${path}.pause: not short, long or null`);
    if (errors.length > before) return null;
    const mark: GroupBoundary = {
      ...anchor,
      pitch: x.pitch as GroupBoundary['pitch'],
      pause: x.pause as GroupBoundary['pause'],
    };
    return { kind, mark };
  }
  if (errors.length > before) return null;
  const mark: ProsodyAnchor & { source: PhraseSource } = anchor;
  if (kind === 'unstressed') return { kind, mark: mark as WordUnstressed };
  if (kind === 'accent') return { kind, mark: mark as PhraseAccent };
  return { kind, mark: mark as WordLink };
}
