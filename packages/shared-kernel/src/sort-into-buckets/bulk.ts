// «Paste a list» — BEHAVIOR §Step 2.
//
// One item per line, `item | bucket label`; a tab, a comma or a spaced dash also separate.
// A label that matches no bucket leaves the item unassigned — the modal counts those before
// the teacher commits, and a bucket is never invented (AC-I4). A line with no label at all
// is the same case.

import { buckets, normalize } from './derive.js';
import type { SortIntoBucketsContent, SortItem } from './model.js';
import { newItem } from './model.js';

export interface BulkResult {
  items: SortItem[];
  /** Lines whose label matched no bucket, or that had none. */
  unmatched: number;
}

const SEPARATOR = /\s*(?:\||\t|,|\s[—–]\s)\s*/;

export function parseBulk(ex: SortIntoBucketsContent, text: string): BulkResult {
  const byLabel = new Map<string, string>();
  for (const b of buckets(ex)) {
    const label = normalize(b.label);
    if (label !== '' && !byLabel.has(label)) byLabel.set(label, b.id);
  }

  const items = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [itemText = '', label = ''] = line.split(SEPARATOR);
      return newItem(itemText.trim(), byLabel.get(normalize(label)) ?? null);
    })
    .filter((item) => item.text !== '');

  return { items, unmatched: items.filter((item) => item.bucketId === null).length };
}
