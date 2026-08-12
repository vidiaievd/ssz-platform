// The check engine for `error_correction` — CHECK_ENGINE.md, "one implementation, three
// surfaces": the student's self-check, the builder's tester, and the teacher queue. They
// must never be able to give different answers, which is why none of this lives in a
// component.
//
// Read it in the order of the handoff: normalise → align → spans → judge → route.

import type {
  AlignOp,
  Alignment,
  Check,
  Coverage,
  ErrorCorrectionTask,
  Item,
  Judgement,
  Routing,
  Span,
  SpanKey,
  SpanState,
  SpanType,
  StrayEdit,
  StudentEdits,
  Verdict,
} from './model.js';
import { EMPTY_EDITS, FUNCTION_WORDS } from './model.js';

// ── Answer-key variants ─────────────────────────────────────────────────────

/**
 * `"Jeg (liker|elsker) det"` → two sentences; `"(nå|)"` makes the word optional.
 *
 * Recursive on purpose: two alternation groups in one sentence multiply out, and the
 * author writing them separately would be the same sentence twice.
 */
export function expandRef(ref: string): string[] {
  const source = (ref ?? '').trim();
  if (source === '') return [];

  const match = /\(([^()]*\|[^()]*)\)/.exec(source);
  if (match === null) return [collapse(source)];

  const out: string[] = [];
  for (const alternative of (match[1] ?? '').split('|')) {
    const rewritten =
      source.slice(0, match.index) + alternative + source.slice(match.index + match[0].length);
    out.push(...expandRef(rewritten));
  }

  return [...new Set(out.map(collapse).filter((s) => s !== ''))];
}

/** Every sentence accepted for this item: `ref` first, then `alts`, all expanded. */
export function variants(item: Item): string[] {
  return [item.ref, ...(item.alts ?? [])].flatMap(expandRef);
}

// ── Normalisation ───────────────────────────────────────────────────────────

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

const PUNCTUATION = /[«»"'“”.,;:!?()[\]\-–—]/g;
const EDGE_PUNCTUATION = /^[«"'([]+|[»"'.,;:!?)\]]+$/g;

export function norm(text: string, check: Check): string {
  let out = collapse(text ?? '');
  if (check.caseInsensitive) out = out.toLowerCase();
  if (check.ignorePunct) out = collapse(out.replace(PUNCTUATION, ' '));
  return out;
}

export const words = (text: string): string[] =>
  collapse(text ?? '')
    .split(' ')
    .filter(Boolean);

/** A word without surrounding punctuation, lowercased — for comparing word identity. */
export const bare = (word: string): string => (word ?? '').replace(EDGE_PUNCTUATION, '').toLowerCase();

/** True when at most one letter separates two words of 4+ characters. */
export function typoEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;

  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return true;
}

export const wordEq = (a: string, b: string, check: Check): boolean =>
  (check.caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b) ||
  (check.typo && typoEq(a.toLowerCase(), b.toLowerCase()));

// ── Alignment ───────────────────────────────────────────────────────────────

/**
 * Word-level LCS alignment. `a` is the student's (or the faulty) sentence, `b` the key.
 *
 * `extra` is a word that exists only in `a`, `missing` only in `b`. Everything above
 * this line is a comparison of two strings; everything below reads these ops.
 */
export function align(a: string[], b: string[], check: Check): Alignment {
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = wordEq(a[i]!, b[j]!, check)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: AlignOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wordEq(a[i]!, b[j]!, check)) {
      ops.push({
        t: 'eq',
        w: a[i]!,
        ref: b[j]!,
        ai: i,
        bi: j,
        typo: a[i] !== b[j] ? b[j]! : null,
      });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ t: 'extra', w: a[i]!, ai: i, bi: j, typo: null });
      i++;
    } else {
      ops.push({ t: 'missing', w: b[j]!, ai: i, bi: j, typo: null });
      j++;
    }
  }
  while (i < n) {
    ops.push({ t: 'extra', w: a[i]!, ai: i, bi: m, typo: null });
    i++;
  }
  while (j < m) {
    ops.push({ t: 'missing', w: b[j]!, ai: n, bi: j, typo: null });
    j++;
  }

  const lcs = dp[0]![0]!;
  return {
    ops,
    sim: n + m > 0 ? (2 * lcs) / (n + m) : 0,
    edits: ops.filter((op) => op.t !== 'eq').length,
  };
}

// ── Spans: what counts as "one mistake" ─────────────────────────────────────

export const spanKey = (span: Pick<Span, 'wFrom' | 'wTo' | 'fix'>): SpanKey =>
  `${span.wFrom}:${span.wTo}:${span.fix}`;

/**
 * The mistake's kind, in the order of CHECK_ENGINE.md §3.
 *
 * The prefix test before the one-letter test is what separates "endelse = bøying" from a
 * slip of the finger: `bodde`/`bodd` differ by one letter *at the end*, and calling that
 * a spelling mistake would teach the student the wrong thing.
 */
export function inferType(wrongWords: string[], fixWords: string[]): SpanType {
  if (fixWords.length === 0) return 'extra';
  if (wrongWords.length === 0) return 'missing';

  const sortedWrong = wrongWords.map(bare).sort().join(' ');
  const sortedFix = fixWords.map(bare).sort().join(' ');
  if (sortedWrong === sortedFix && wrongWords.length > 1) return 'order';

  if (wrongWords.length === 1 && fixWords.length === 1) {
    const a = bare(wrongWords[0]!);
    const b = bare(fixWords[0]!);
    if (FUNCTION_WORDS.includes(a) || FUNCTION_WORDS.includes(b)) return 'function';
    if (a !== b && (a.startsWith(b) || b.startsWith(a))) return 'form';
    if (typoEq(a, b)) return 'spelling';
    return 'form';
  }

  return 'form';
}

interface RawGroup {
  wFrom: number;
  wTo: number;
  rFrom: number;
  rTo: number;
  order?: boolean;
}

/**
 * Every mistake in the item, derived from `wrong` against the first accepted variant.
 *
 * The alignment runs with `typo: false` regardless of the setting — the author's two
 * lines are read literally, or a deliberate one-letter mistake would align as a match
 * and vanish from the list the author is looking at.
 */
export function spans(item: Item, check: Check): Span[] {
  const w = words(item.wrong);
  const r = words(variants(item)[0] ?? '');
  if (w.length === 0 || r.length === 0) return [];

  const { ops } = align(w, r, { ...check, typo: false });

  // 1 — runs of consecutive deviations
  const raw: RawGroup[] = [];
  let current: RawGroup | null = null;
  for (const op of ops) {
    if (op.t === 'eq' && op.typo === null) {
      if (current !== null) {
        raw.push(current);
        current = null;
      }
      continue;
    }
    const wTo = op.t === 'missing' ? op.ai : op.ai + 1;
    const rTo = op.t === 'extra' ? op.bi : op.bi + 1;
    if (current === null) current = { wFrom: op.ai, wTo, rFrom: op.bi, rTo };
    else {
      current.wTo = Math.max(current.wTo, wTo);
      current.rTo = Math.max(current.rTo, rTo);
    }
  }
  if (current !== null) raw.push(current);

  // 2 — two groups separated by at most one matching word, holding the same multiset of
  // words on both sides, are one word-order mistake and not two independent ones.
  const merged: RawGroup[] = [];
  for (const group of raw) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && group.wFrom - previous.wTo <= 2) {
      const wSide = w.slice(previous.wFrom, group.wTo).map(bare).sort().join(' ');
      const rSide = r.slice(previous.rFrom, group.rTo).map(bare).sort().join(' ');
      if (wSide === rSide) {
        previous.wTo = group.wTo;
        previous.rTo = group.rTo;
        previous.order = true;
        continue;
      }
    }
    merged.push(group);
  }

  // 3 — type, the key's wording, then the author's overrides on top
  return merged.map((group, index) => {
    const wrongWords = w.slice(group.wFrom, group.wTo);
    const fixWords = r.slice(group.rFrom, group.rTo);

    const span: Span = {
      index,
      wFrom: group.wFrom,
      wTo: group.wTo,
      rFrom: group.rFrom,
      rTo: group.rTo,
      wrong: wrongWords.join(' '),
      fix: fixWords.join(' '),
      type: group.order === true ? 'order' : inferType(wrongWords, fixWords),
      note: '',
      soft: false,
      key: '',
    };
    span.key = spanKey(span);

    const override = (item.meta ?? {})[span.key];
    if (override !== undefined) {
      if (override.type !== undefined) span.type = override.type;
      if (override.note !== undefined) span.note = override.note;
      if (override.soft === true) span.soft = true;
    }
    return span;
  });
}

/** Spans that are actually mistakes. Every count the student sees uses this. */
export const hardSpans = (item: Item, check: Check): Span[] =>
  spans(item, check).filter((span) => !span.soft);

// ── The student's edits ─────────────────────────────────────────────────────

/** Assemble the sentence the student's edits produce. */
export function build(item: Item, edits: StudentEdits | undefined): string {
  const w = words(item.wrong);
  const state = edits ?? EMPTY_EDITS;
  const out: string[] = [];

  for (let i = 0; i <= w.length; i++) {
    const inserted = state.ins[i];
    if (inserted !== undefined && inserted.trim() !== '') out.push(inserted.trim());
    if (i === w.length) break;

    if (state.marked[i] === true) {
      const fix = state.fix[i];
      if (fix === undefined) out.push(w[i]!);
      else if (fix.trim() !== '') out.push(fix.trim());
      // an empty fix strikes the word out
    } else out.push(w[i]!);
  }

  return out.join(' ');
}

/** Word indices the student marked. */
export function touched(edits: StudentEdits | undefined): Set<number> {
  const state = edits ?? EMPTY_EDITS;
  const out = new Set<number>();
  for (const [key, marked] of Object.entries(state.marked)) if (marked) out.add(Number(key));
  return out;
}

/** Word indices whose text the student actually changed — marking alone does not count. */
export function edited(item: Item, edits: StudentEdits | undefined): Set<number> {
  const w = words(item.wrong);
  const state = edits ?? EMPTY_EDITS;
  const out = new Set<number>();

  w.forEach((word, i) => {
    const fix = state.fix[i];
    if (state.marked[i] === true && fix !== undefined && fix.trim() !== word) out.add(i);
  });

  return out;
}

/** Slots carrying an inserted word. */
export function inserted(edits: StudentEdits | undefined): Set<number> {
  const state = edits ?? EMPTY_EDITS;
  const out = new Set<number>();
  for (const [slot, word] of Object.entries(state.ins)) {
    if ((word ?? '').trim() !== '') out.add(Number(slot));
  }
  return out;
}

/**
 * Did the student touch this span, and did what they wrote match the key *locally*?
 *
 * Locally is the point: a sentence can be wrong overall while one mistake in it was
 * corrected, and the student deserves to be told that much.
 */
export function spanState(
  item: Item,
  edits: StudentEdits | undefined,
  span: Span,
  check: Check,
): Pick<SpanState, 'touched' | 'hit' | 'localFix' | 'state'> {
  const w = words(item.wrong);
  const state = edits ?? EMPTY_EDITS;
  const isInsert = span.wFrom === span.wTo;

  let wasTouched = false;
  const local: string[] = [];

  for (let i = span.wFrom; i <= span.wTo; i++) {
    const insertion = state.ins[i];
    if (insertion !== undefined && insertion.trim() !== '') {
      wasTouched = true;
      local.push(insertion.trim());
    }
    if (i >= span.wTo) break;

    const marked = state.marked[i] === true;
    const fix = state.fix[i];
    if (marked) wasTouched = true;
    if (marked && fix !== undefined) {
      if (fix.trim() !== '') local.push(fix.trim());
    } else local.push(w[i]!);
  }

  if (isInsert) wasTouched = (state.ins[span.wFrom] ?? '').trim() !== '';

  const localFix = local.join(' ');
  const wanted = words(span.fix);
  const produced = words(localFix);
  const hit =
    norm(localFix, check) === norm(span.fix, check) ||
    (check.typo &&
      produced.length === wanted.length &&
      produced.every((word, k) => wordEq(word, wanted[k]!, check)));

  return { touched: wasTouched, hit, localFix, state: !wasTouched ? 'missed' : hit ? 'fixed' : 'attempted' };
}

// ── The verdict ─────────────────────────────────────────────────────────────

/**
 * Judge one item. Same function in the builder, the runner and the teacher queue.
 *
 * Note what it does *not* do: decide whether the student passed. That is `route`, and
 * keeping the two apart is what makes "the auto-check can only approve" enforceable in
 * one place.
 */
export function judge(check: Check, item: Item, edits: StudentEdits | undefined): Judgement {
  const accepted = variants(item);
  const built = build(item, edits);
  const hard = hardSpans(item, check);

  if (accepted.length === 0) {
    return {
      verdict: 'noref',
      sim: 0,
      ops: [],
      ref: '',
      spans: [],
      fixedCount: 0,
      spanCount: hard.length,
      built,
      stray: [],
      exact: false,
    };
  }

  const w = words(item.wrong);
  const untouched = touched(edits).size === 0 && inserted(edits).size === 0;

  let best: Alignment & { ref: string } = { ops: [], sim: -1, edits: 0, ref: accepted[0]! };
  for (const variant of accepted) {
    const candidate = align(words(built), words(variant), check);
    if (candidate.sim > best.sim) best = { ...candidate, ref: variant };
  }

  const normalised = norm(built, check);
  const exact = accepted.some((variant) => norm(variant, check) === normalised);
  const typoOnly =
    !exact && best.ops.every((op) => op.t === 'eq') && best.ops.some((op) => op.typo !== null);

  const states: SpanState[] = hard.map((span) => ({ ...span, ...spanState(item, edits, span, check) }));
  const fixedCount = states.filter((span) => span.state === 'fixed').length;

  const inSpan = (index: number): boolean =>
    hard.some((span) => index >= span.wFrom && index < span.wTo);
  const inSpanSlot = (slot: number): boolean =>
    hard.some((span) =>
      span.wFrom === span.wTo ? span.wFrom === slot : slot > span.wFrom && slot < span.wTo,
    );

  const state = edits ?? EMPTY_EDITS;
  const stray: StrayEdit[] = [
    ...[...edited(item, edits)]
      .filter((index) => !inSpan(index))
      .map((index): StrayEdit => ({ kind: 'edit', index, word: w[index] ?? '' })),
    ...[...inserted(edits)]
      .filter((slot) => !inSpanSlot(slot))
      .map((slot): StrayEdit => ({ kind: 'insert', index: slot, word: state.ins[slot] ?? '' })),
  ];

  let verdict: Verdict;
  if (untouched) verdict = 'empty';
  else if (exact) verdict = 'exact';
  else if (typoOnly) verdict = 'typo';
  else if (hard.length > 0 && fixedCount === hard.length) verdict = stray.length > 0 ? 'stray' : 'typo';
  else if (fixedCount > 0) verdict = 'partial';
  else verdict = best.sim >= check.near ? 'partial' : 'off';

  if ((verdict === 'exact' || verdict === 'typo') && stray.length > 0 && check.strayEdits === 'block') {
    verdict = 'stray';
  }

  return {
    verdict,
    sim: best.sim,
    ops: best.ops,
    ref: best.ref,
    spans: states,
    fixedCount,
    spanCount: hard.length,
    built,
    stray,
    exact,
  };
}

/**
 * Where the answer goes. **The auto-check can only approve.**
 *
 * Everything else — including `typo` and `partial` — is a suggestion to the teacher, not
 * a rejection. Nothing in this file may ever return a verdict of "wrong" on its own.
 */
export function route(check: Check, judgement: Judgement): Routing {
  if (!check.on) return 'teacher';
  if (judgement.verdict !== 'exact') return 'teacher';
  if (check.requireAllSpans && judgement.spanCount > 0 && judgement.fixedCount < judgement.spanCount) {
    return 'teacher';
  }
  if (judgement.stray.length > 0 && check.strayEdits !== 'ignore') return 'teacher';
  return check.exactPass ? 'pass' : 'teacher';
}

// ── Authoring numbers ───────────────────────────────────────────────────────

/** Items the author has actually written a faulty sentence for. */
export const authoredItems = (task: ErrorCorrectionTask): Item[] =>
  (task.items ?? []).filter((item) => item.wrong.trim() !== '');

export const hasRef = (item: Item): boolean =>
  item.wrong.trim() !== '' && item.ref.trim() !== '';

export function coverage(task: ErrorCorrectionTask): Coverage {
  const items = authoredItems(task);
  const perItem = items.map((item) => hardSpans(item, task.check));
  const all = perItem.flat();

  const byType: Coverage['byType'] = {};
  for (const span of all) byType[span.type] = (byType[span.type] ?? 0) + 1;

  return {
    items: items.length,
    errors: all.length,
    byType,
    withRef: items.filter(hasRef).length,
    explained: all.filter((span) => span.note.trim() !== '').length,
    multiVariant: items.filter((item) => variants(item).length > 1).length,
    singleError: perItem.filter((list) => list.length === 1).length,
  };
}
