// Validation of a stored layer against its text — what the server checks before saving a
// layer and what the editor shows. Codes and parameters only; the UI words them.
//
// A stale anchor (`PR_ANCHOR_STALE`) is a blocker: the mark would be drawn under another word.
// The fix is `reanchorProsody` with the text the layer was made for, never a silent skip.

import { TOKENIZER_ID, tokenize } from '../text/words.js';
import type { ProsodyKind, ProsodyLayer } from './model.js';
import { anchorLength, anchorWords, elementsOf } from './model.js';

export type ProsodyIssueLevel = 'blocker' | 'warning';

export type ProsodyIssue =
  | { code: 'PR_TOKENIZER'; level: 'blocker'; tokenizer: string }
  | { code: 'PR_ANCHOR_MISSING'; level: 'blocker'; kind: ProsodyKind; i: number }
  | {
      code: 'PR_ANCHOR_STALE';
      level: 'blocker';
      kind: ProsodyKind;
      i: number;
      expected: string;
      found: string;
    }
  | { code: 'PR_VOWEL_OUTSIDE_WORD'; level: 'blocker'; i: number }
  | { code: 'PR_DUPLICATE'; level: 'blocker'; kind: ProsodyKind; i: number }
  /** A word marked both stressed and unstressed. */
  | { code: 'PR_STRESS_CONFLICT'; level: 'blocker'; i: number }
  | { code: 'PR_BOUNDARY_EMPTY'; level: 'blocker'; i: number }
  | { code: 'PR_LINK_ACROSS_BOUNDARY'; level: 'warning'; i: number }
  | { code: 'PR_ORPHANS'; level: 'warning'; count: number };

export function prosodyIssues(text: string, layer: ProsodyLayer): ProsodyIssue[] {
  const out: ProsodyIssue[] = [];
  if (layer.tokenizer !== TOKENIZER_ID) {
    // Every anchor was counted with another tokenizer; checking them would only list noise.
    return [{ code: 'PR_TOKENIZER', level: 'blocker', tokenizer: String(layer.tokenizer) }];
  }

  const tokens = tokenize(text);
  const seen = new Set<string>();

  for (const { kind, mark } of elementsOf(layer)) {
    const n = anchorLength(kind);
    const run = tokens.slice(mark.i, mark.i + n);
    if (!Number.isInteger(mark.i) || mark.i < 0 || run.length < n) {
      out.push({ code: 'PR_ANCHOR_MISSING', level: 'blocker', kind, i: mark.i });
      continue;
    }
    const found = run.map((t) => t.w.toLowerCase()).join(' ');
    const expected = anchorWords(mark).join(' ');
    if (found !== expected) {
      out.push({ code: 'PR_ANCHOR_STALE', level: 'blocker', kind, i: mark.i, expected, found });
      continue;
    }

    const key = `${kind}:${mark.i}`;
    if (seen.has(key)) out.push({ code: 'PR_DUPLICATE', level: 'blocker', kind, i: mark.i });
    seen.add(key);

    if (kind === 'stress') {
      const { s, e } = mark.vowel;
      const length = run[0]?.w.length ?? 0;
      if (!(Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e > s && e <= length)) {
        out.push({ code: 'PR_VOWEL_OUTSIDE_WORD', level: 'blocker', i: mark.i });
      }
    }
  }

  const stressed = new Set(layer.stresses.map((st) => st.i));
  for (const u of layer.unstressed ?? []) {
    if (stressed.has(u.i)) out.push({ code: 'PR_STRESS_CONFLICT', level: 'blocker', i: u.i });
  }

  for (const b of layer.boundaries) {
    if (b.pitch === null && b.pause === null)
      out.push({ code: 'PR_BOUNDARY_EMPTY', level: 'blocker', i: b.i });
  }
  const ends = new Set(layer.boundaries.map((b) => b.i));
  for (const l of layer.links) {
    if (ends.has(l.i)) out.push({ code: 'PR_LINK_ACROSS_BOUNDARY', level: 'warning', i: l.i });
  }
  if (layer.orphans.length > 0) {
    out.push({ code: 'PR_ORPHANS', level: 'warning', count: layer.orphans.length });
  }
  return out;
}
