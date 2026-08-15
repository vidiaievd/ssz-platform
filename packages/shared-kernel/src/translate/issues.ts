// The authoring checks for the translate templates — CHECK_ENGINE.md, "Forfattersjekker".
// One engine, three surfaces: the builder's rail dots, the finish gate, and the server on
// save. One function, so the three cannot disagree.
//
// Issues carry a code and the parameters their message needs, never the message itself:
// the teacher UI is localised into four languages. Same contract as
// `wordbank-gapfill/issues.ts` and `error-correction/issues.ts`.

import type { Translate } from './model.js';
import { authoredItems, coverage, expandRef, MAX_VARIANTS, norm, refs, variants } from './engine.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

type ItemContext = { itemId: string; itemIndex: number };

export type Issue =
  | { code: 'EX_NO_INSTRUCTION'; level: 'warning'; step: 1 }
  | { code: 'BOTH_ONE_DIRECTION'; level: 'warning'; step: 1 }
  | { code: 'EX_NO_ITEMS'; level: 'blocker'; step: 2 }
  | { code: 'SINGLE_MANY_ITEMS'; level: 'warning'; step: 2; itemCount: number }
  | ({ code: 'ITEM_NO_REF'; level: 'blocker'; step: 2 } & ItemContext)
  | ({ code: 'ITEM_TOO_LONG'; level: 'warning'; step: 2; wordCount: number } & ItemContext)
  | ({ code: 'REF_BROKEN_ALTERNATIVES'; level: 'warning'; step: 2; ref: string } & ItemContext)
  | ({ code: 'REF_TOO_MANY_VARIANTS'; level: 'warning'; step: 2; variantCount: number } & ItemContext)
  | ({ code: 'FORBID_IN_REF'; level: 'blocker'; step: 3; guard: string } & ItemContext)
  | ({ code: 'REQUIRE_NOT_IN_REF'; level: 'warning'; step: 3; guard: string } & ItemContext)
  | { code: 'NO_ALT_VARIANTS'; level: 'warning'; step: 3 }
  | { code: 'CHECK_FOLD_DIACRITICS'; level: 'warning'; step: 3 }
  | { code: 'CHECK_NEAR_TOO_LOW'; level: 'warning'; step: 3; near: number }
  | { code: 'AI_WITHOUT_CHECK'; level: 'info'; step: 4 }
  | { code: 'AI_UNLIMITED_BEFORE_SUBMIT'; level: 'warning'; step: 4 }
  | { code: 'REFS_AFTER_SUBMIT'; level: 'info'; step: 4 };

export type IssueCode = Issue['code'];

/** A bracket or a pipe left in an expanded variant: the alternation was never closed. */
const BRACKET_RESIDUE = /[()|]/;

/** Past this, a sentence stops being a translation drill and becomes a reading task. */
const LONG_SENTENCE_WORDS = 18;
/** Below this, "near" swallows everything and the queue's sort order stops meaning anything. */
const NEAR_FLOOR = 0.6;

/**
 * Every problem with the document, in authoring order: step 1, then 2, and so on.
 *
 * The order is part of the contract — the client and the server compare lists, and a set
 * comparison would hide a real disagreement about which item is at fault.
 */
export function issues(ex: Translate): Issue[] {
  const out: Issue[] = [];
  const check = ex.check;
  const written = authoredItems(ex);

  // ── Step 1 — direction and framing ────────────────────────────────────────
  if (ex.instructions.trim() === '') {
    out.push({ code: 'EX_NO_INSTRUCTION', level: 'warning', step: 1 });
  }

  if (
    ex.dir === 'both' &&
    written.length > 0 &&
    written.every((item) => (item.dir ?? 'to_target') === (written[0]!.dir ?? 'to_target'))
  ) {
    out.push({ code: 'BOTH_ONE_DIRECTION', level: 'warning', step: 1 });
  }

  // ── Step 2 — the sentences ────────────────────────────────────────────────
  if (written.length === 0) out.push({ code: 'EX_NO_ITEMS', level: 'blocker', step: 2 });

  if (ex.format === 'single' && written.length > 1) {
    out.push({ code: 'SINGLE_MANY_ITEMS', level: 'warning', step: 2, itemCount: written.length });
  }

  written.forEach((item, itemIndex) => {
    const context: ItemContext = { itemId: item.id, itemIndex };
    const keys = refs(item);

    // Without a key neither the teacher nor the check has anything to measure against,
    // and everything below this line would be reporting on an empty set.
    if (keys.length === 0) {
      out.push({ code: 'ITEM_NO_REF', level: 'blocker', step: 2, ...context });
      return;
    }

    const wordCount = item.source.trim().split(/\s+/).length;
    if (wordCount > LONG_SENTENCE_WORDS) {
      out.push({ code: 'ITEM_TOO_LONG', level: 'warning', step: 2, wordCount, ...context });
    }

    // The most useful check in the set — the handoff's "a key variant that does not pass
    // its own check", which it explains as "nearly always a broken bracket".
    //
    // It is implemented on the expansion rather than by re-judging the raw line, which is
    // what the prototype does: a line carrying valid alternatives normalises to
    // "… i tre år år nå" and fails against itself, so the prototype warns on every
    // correctly written key and stays silent on `"Jeg bor (her"`, which expands to itself
    // and scores exact. Bracket residue after expansion is the fault the author cannot
    // see by reading the line back.
    for (const ref of keys) {
      if (expandRef(ref).some((variant) => BRACKET_RESIDUE.test(variant))) {
        out.push({ code: 'REF_BROKEN_ALTERNATIVES', level: 'warning', step: 2, ref, ...context });
      }
    }

    const variantCount = [...new Set(keys.flatMap(expandUncapped))].length;
    if (variantCount > MAX_VARIANTS) {
      out.push({
        code: 'REF_TOO_MANY_VARIANTS',
        level: 'warning',
        step: 2,
        variantCount,
        ...context,
      });
    }

    // ── Step 3, per item — the guards ───────────────────────────────────────
    const accepted = variants(item);

    for (const guard of item.forbid ?? []) {
      if (guard.text.trim() === '') continue;
      if (accepted.some((variant) => norm(variant, check).includes(norm(guard.text, check)))) {
        out.push({
          code: 'FORBID_IN_REF',
          level: 'blocker',
          step: 3,
          guard: guard.text,
          ...context,
        });
      }
    }

    for (const guard of item.require ?? []) {
      if (guard.text.trim() === '') continue;
      if (!accepted.some((variant) => norm(variant, check).includes(norm(guard.text, check)))) {
        out.push({
          code: 'REQUIRE_NOT_IN_REF',
          level: 'warning',
          step: 3,
          guard: guard.text,
          ...context,
        });
      }
    }
  });

  // ── Step 3 — the check ────────────────────────────────────────────────────
  // Guarded on `withRef`: an item still missing its key has no variants either, and a
  // warning about coverage under a blocker about a missing key is noise.
  const spread = coverage(ex);
  if (check.on && spread.withRef > 0 && spread.multiVariant === 0) {
    out.push({ code: 'NO_ALT_VARIANTS', level: 'warning', step: 3 });
  }
  if (check.on && check.foldDiacritics) {
    out.push({ code: 'CHECK_FOLD_DIACRITICS', level: 'warning', step: 3 });
  }
  if (check.on && check.near < NEAR_FLOOR) {
    out.push({ code: 'CHECK_NEAR_TOO_LOW', level: 'warning', step: 3, near: check.near });
  }

  // ── Step 4 — flow and AI ──────────────────────────────────────────────────
  if (!check.on && ex.ai.on) out.push({ code: 'AI_WITHOUT_CHECK', level: 'info', step: 4 });
  if (ex.ai.on && ex.ai.visibility === 'studentBefore' && ex.flow.selfCheck === 0) {
    out.push({ code: 'AI_UNLIMITED_BEFORE_SUBMIT', level: 'warning', step: 4 });
  }
  if (ex.flow.showRefs === 'afterSubmit' && check.exactPass) {
    out.push({ code: 'REFS_AFTER_SUBMIT', level: 'info', step: 4 });
  }

  return out;
}

/**
 * Variants before the engine's cap, so the warning can say how many the author actually
 * wrote rather than the number the engine settled for.
 */
function expandUncapped(ref: string): string[] {
  const source = (ref ?? '').trim();
  if (source === '') return [];
  const match = /\(([^()]*\|[^()]*)\)/.exec(source);
  if (match === null) return [source.replace(/\s+/g, ' ').trim()];

  const out: string[] = [];
  for (const alternative of (match[1] ?? '').split('|')) {
    out.push(
      ...expandUncapped(
        source.slice(0, match.index) + alternative + source.slice(match.index + match[0].length),
      ),
    );
  }
  return out;
}

export const blockers = (ex: Translate): Issue[] =>
  issues(ex).filter((issue) => issue.level === 'blocker');

export const warnings = (ex: Translate): Issue[] =>
  issues(ex).filter((issue) => issue.level === 'warning');

export const isReady = (ex: Translate): boolean => blockers(ex).length === 0;

export type StepState = 'ok' | 'warn' | 'err' | 'empty';

/**
 * The dot on one step of the rail. `info` is deliberately not counted — it is a remark,
 * and a rail dot that goes amber for a remark trains the author to ignore amber.
 */
export function stepState(ex: Translate, step: IssueStep): { state: StepState; blockers: number } {
  const mine = issues(ex).filter((issue) => issue.step === step && issue.level !== 'info');
  const blocking = mine.filter((issue) => issue.level === 'blocker').length;

  if (blocking > 0) return { state: 'err', blockers: blocking };
  if (mine.length > 0) return { state: 'warn', blockers: 0 };
  if (step === 2 && authoredItems(ex).length === 0) return { state: 'empty', blockers: 0 };
  return { state: 'ok', blockers: 0 };
}
