// Test fixtures. Not part of the published surface — `tsconfig.json` excludes
// `*.test-support.ts` from the build.
//
// Not `SB_SAMPLE` from the prototype: a fixture reproducing the handoff's noun list would
// make every test read as a check of that list rather than of the rule under test. These
// build the smallest document each rule needs, with fixed ids so a test can name them.

import type { Bucket, ItemFeedback, Settings, SortIntoBucketsContent, SortItem } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

export const EN: Bucket = { id: 'b-en', label: 'en', rule: 'Hankjønn. Bestemt form -en.' };
export const EI: Bucket = { id: 'b-ei', label: 'ei', rule: 'Hunkjønn. Bestemt form -a.' };
export const ET: Bucket = { id: 'b-et', label: 'et', rule: 'Intetkjønn. Bestemt form -et.' };

export function item(
  id: string,
  text: string,
  bucketId: string | null,
  extra: Partial<SortItem> = {},
): SortItem {
  return { id, text, bucketId, also: [], why: `${text} — why`, ...extra };
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

const fbFor = (ids: readonly string[]): Record<string, ItemFeedback> =>
  Object.fromEntries(ids.map((id) => [id, { def: `${id} — default`, ov: {} }]));

/**
 * A valid three-bucket board with six items, two per bucket, every one explained — the
 * shape that raises no issue at all, so a test can break exactly one thing.
 */
export function exercise(overrides: Partial<SortIntoBucketsContent> = {}): SortIntoBucketsContent {
  const items = [
    item('i1', 'bil', EN.id),
    item('i2', 'gutt', EN.id),
    item('i3', 'jente', EI.id),
    item('i4', 'bok', EI.id),
    item('i5', 'hus', ET.id),
    item('i6', 'eple', ET.id),
  ];
  return {
    title: 'Kjønn',
    instruction: 'Sorter substantivene.',
    buckets: [EN, EI, ET],
    useNone: false,
    noneLabel: 'Ingen av delene',
    items,
    fb: fbFor(items.map((i) => i.id)),
    settings: settings(),
    ...overrides,
  };
}

/** Issue codes only — what most assertions care about. */
export function codes(issues: ReadonlyArray<{ code: string }>): string[] {
  return issues.map((i) => i.code);
}
