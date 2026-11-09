import type { LexiconVariant } from '../../domain/align-word.js';

/** The lexicon behind each course language: NB Uttale østnorsk for Bokmål (plan 88 Q1). */
export const LEXICON_OF_LANGUAGE: Readonly<Record<string, { dialect: string; source: string }>> = {
  nb: { dialect: 'e', source: 'nb_uttale' },
};

export interface LexiconRow {
  wordKey: string;
  nofabet: string;
  pos: string;
  feats: string;
}

/** The distinct lowercase keys to look up; empty and repeated words dropped. */
export function lookupKeys(words: readonly string[]): string[] {
  return [...new Set(words.map((w) => w.toLowerCase()).filter((w) => w.length > 0))];
}

/** Rows grouped by word, in the order read. Empty features stay absent: they agree with any. */
export function variantsByWord(rows: readonly LexiconRow[]): Map<string, LexiconVariant[]> {
  const out = new Map<string, LexiconVariant[]>();
  for (const row of rows) {
    const variant: LexiconVariant = { nofabet: row.nofabet, pos: row.pos };
    if (row.feats) variant.feats = row.feats;
    const list = out.get(row.wordKey);
    if (list) list.push(variant);
    else out.set(row.wordKey, [variant]);
  }
  return out;
}
