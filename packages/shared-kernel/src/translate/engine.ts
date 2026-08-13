// The check engine for the translate templates — CHECK_ENGINE.md.
//
// One implementation, four surfaces: the student's self-check, the builder's tester, the
// author checks in issues.ts, and the teacher queue. They must never be able to disagree,
// which is why none of this lives in a component or in a service.
//
// Read it in the order of the handoff: expand → normalise → compare words → diff → judge
// → route.
//
// What the engine deliberately cannot do: reject. `route` returns `pass` for a hit on the
// key and `teacher` for everything else, including answers it scored at 0.99 similarity.
// A word-order inversion barely moves an LCS score, and telling a student their correct
// translation is wrong costs more than a teacher's minute.

import type {
  Check,
  Coverage,
  Diff,
  DiffToken,
  Guard,
  GuardHit,
  Item,
  ItemDirection,
  Judgement,
  Routing,
  TranslateTask,
  Verdict,
} from './model.js';

/**
 * Ceiling on expanded variants per item. Two alternation groups of three multiply to
 * nine; five of them run to hundreds, and every one of them is compared word by word
 * against the answer. Authors are warned at the ceiling (`REF_TOO_MANY_VARIANTS`) rather
 * than silently truncated in the builder — but the engine still stops here, because a
 * pathological key must not be able to stall a submission.
 */
export const MAX_VARIANTS = 64;

// ── Answer-key variants ─────────────────────────────────────────────────────

const ALTERNATION = /\(([^()]*\|[^()]*)\)/;

/**
 * `"Jeg (liker|elsker) katter"` → two sentences; `"Jeg bor her (nå|)"` makes the last
 * word optional.
 *
 * Recursive: several groups in one sentence multiply out. Nested brackets are not
 * matched by the pattern and are left as literal text — supporting them means changing
 * this function and nothing else.
 */
export function expandRef(ref: string): string[] {
  const source = (ref ?? '').trim();
  if (source === '') return [];

  const match = ALTERNATION.exec(source);
  if (match === null) return [collapse(source)];

  const out: string[] = [];
  for (const alternative of (match[1] ?? '').split('|')) {
    const rewritten =
      source.slice(0, match.index) + alternative + source.slice(match.index + match[0].length);
    out.push(...expandRef(rewritten));
  }

  return [...new Set(out.map(collapse).filter((s) => s !== ''))];
}

/** True when a key line carries inline alternatives — the builder shows the expansion. */
export const hasAlts = (ref: string): boolean => ALTERNATION.test(ref ?? '');

/** The author's non-empty key lines, in order. */
export const refs = (item: Item): string[] =>
  (item.refs ?? []).filter((ref) => ref.trim() !== '');

/** Every sentence accepted for this item, expanded and deduplicated, capped. */
export function variants(item: Item): string[] {
  const out = [...new Set(refs(item).flatMap(expandRef))];
  return out.length > MAX_VARIANTS ? out.slice(0, MAX_VARIANTS) : out;
}

// ── Normalisation ───────────────────────────────────────────────────────────

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

const PUNCTUATION = /[«»"'“”.,;:!?()[\]\-–—]/g;

/**
 * The comparable form of a sentence. Whitespace is always collapsed; the rest is the
 * author's editorial choice.
 */
export function norm(text: string, check: Check): string {
  let out = collapse(text ?? '');
  if (check.caseInsensitive) out = out.toLowerCase();
  if (check.ignorePunct) out = collapse(out.replace(PUNCTUATION, ' '));
  if (check.foldDiacritics) out = out.replace(/æ/gi, 'a').replace(/ø/gi, 'o').replace(/å/gi, 'a');
  return out;
}

export const tokens = (text: string, check: Check): string[] =>
  norm(text, check).split(' ').filter(Boolean);

/**
 * True when at most one edit separates two words of 4+ characters.
 *
 * Short words are excluded on purpose: `hun`/`han`, `en`/`et`, `har`/`har` are different
 * words to a learner, not slips of the finger.
 */
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

/** Both sides arrive normalised, so case and punctuation are already settled here. */
export const wordEq = (a: string, b: string, check: Check): boolean =>
  a === b || (check.typo && typoEq(a, b));

// ── Diff ────────────────────────────────────────────────────────────────────

/**
 * Word-level LCS diff. `a` is the student's answer, `b` a variant of the key.
 *
 * The LCS barely penalises reordering, which is why `"Tre år har jeg bodd i Tromsø"`
 * lands in `near` and not in `off`. That is a deliberate compromise of the handoff: word
 * order is a question for a person.
 */
export function diff(a: string[], b: string[], check: Check): Diff {
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

  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wordEq(a[i]!, b[j]!, check)) {
      out.push({ t: 'eq', w: a[i]!, typo: a[i] === b[j] ? null : b[j]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ t: 'extra', w: a[i]!, typo: null });
      i++;
    } else {
      out.push({ t: 'missing', w: b[j]!, typo: null });
      j++;
    }
  }
  while (i < n) out.push({ t: 'extra', w: a[i++]!, typo: null });
  while (j < m) out.push({ t: 'missing', w: b[j++]!, typo: null });

  const lcs = dp[0]![0]!;
  return {
    tokens: out,
    sim: n + m > 0 ? (2 * lcs) / (n + m) : 0,
    edits: out.filter((token) => token.t !== 'eq').length,
  };
}

// ── Verdict ─────────────────────────────────────────────────────────────────

const guardHits = (guards: Guard[], normalised: string, check: Check, want: boolean): GuardHit[] =>
  (guards ?? [])
    .filter((guard) => guard.text.trim() !== '')
    .filter((guard) => normalised.includes(norm(guard.text, check)) === want)
    .map((guard) => ({
      text: guard.text,
      ...(guard.note === undefined || guard.note === '' ? {} : { note: guard.note }),
    }));

/**
 * Score one answer against one item.
 *
 * The ladder is `exact` → `typo` → `near` → `off`, taken against the closest variant. Two
 * outcomes sit outside it: `empty` (nothing submitted) and `noref` (the author left no
 * key, which is a blocker in the builder and must not read as a wrong answer here).
 *
 * A fired guard demotes `exact` and `typo` to `near`: the exercise trains a form, not a
 * string, and an answer that reaches the key while dodging the form has not done the task.
 */
export function judge(check: Check, item: Item, answer: string): Judgement {
  const accepted = variants(item);
  const answerTokens = tokens(answer ?? '', check);
  const normalised = norm(answer ?? '', check);

  const empty = (verdict: Verdict, ref: string): Judgement => ({
    verdict,
    sim: 0,
    tokens: [],
    ref,
    missing: [],
    banned: [],
    exact: false,
  });

  if (answerTokens.length === 0) return empty('empty', accepted[0] ?? '');
  if (accepted.length === 0) return empty('noref', '');

  let best: (Diff & { ref: string }) | null = null;
  for (const variant of accepted) {
    const scored = diff(answerTokens, tokens(variant, check), check);
    if (best === null || scored.sim > best.sim) best = { ...scored, ref: variant };
    // Nothing can beat an identical match, and a capped key still runs 64 comparisons.
    if (best.sim === 1) break;
  }

  const exact = accepted.some((variant) => norm(variant, check) === normalised);
  const typoOnly =
    !exact &&
    best!.tokens.every((token) => token.t === 'eq') &&
    best!.tokens.some((token) => token.typo !== null);

  const missing = guardHits(item.require, normalised, check, false);
  const banned = guardHits(item.forbid, normalised, check, true);

  let verdict: Verdict = exact
    ? 'exact'
    : typoOnly
      ? 'typo'
      : best!.sim >= check.near
        ? 'near'
        : 'off';

  if ((verdict === 'exact' || verdict === 'typo') && (missing.length > 0 || banned.length > 0)) {
    verdict = 'near';
  }

  return {
    verdict,
    sim: best!.sim,
    tokens: best!.tokens,
    ref: best!.ref,
    missing,
    banned,
    exact: verdict === 'exact',
  };
}

/**
 * Where the judged answer goes.
 *
 * The whole routing table of the handoff's step 3 is these three lines: with the check
 * off nothing is decided automatically, a hit on the key closes the item when the author
 * allows it, and every other verdict is a suggestion to a teacher.
 */
export function route(check: Check, judgement: Judgement): Routing {
  if (!check.on) return 'teacher';
  if (judgement.verdict === 'exact' && check.exactPass) return 'pass';
  return 'teacher';
}

// ── Reading the document ────────────────────────────────────────────────────

/** Items the author has actually written a sentence into. */
export const authoredItems = (task: TranslateTask): Item[] =>
  (task.items ?? []).filter((item) => item.source.trim() !== '');

/** The direction of one item: its own only in a mixed set. */
export const itemDirection = (task: TranslateTask, item: Item): ItemDirection =>
  task.dir === 'both' ? (item.dir === 'from_target' ? 'from_target' : 'to_target') : task.dir;

/** The language the student reads for this item. */
export const sourceLang = (task: TranslateTask, item: Item): string =>
  itemDirection(task, item) === 'from_target' ? task.langs.target : task.langs.explain;

/** The language the student writes in for this item. */
export const answerLang = (task: TranslateTask, item: Item): string =>
  itemDirection(task, item) === 'from_target' ? task.langs.explain : task.langs.target;

/** The items actually run: `single` shows the first one and ignores the rest. */
export const runItems = (task: TranslateTask): Item[] => {
  const written = authoredItems(task);
  return task.format === 'single' ? written.slice(0, 1) : written;
};

const itemGuards = (item: Item): Guard[] =>
  [...(item.require ?? []), ...(item.forbid ?? [])].filter((guard) => guard.text.trim() !== '');

export function coverage(task: TranslateTask): Coverage {
  const written = authoredItems(task);
  const guards = written.flatMap(itemGuards);

  return {
    items: written.length,
    withRef: written.filter((item) => refs(item).length > 0).length,
    multiVariant: written.filter((item) => variants(item).length > 1).length,
    variants: written.reduce((sum, item) => sum + variants(item).length, 0),
    explained: written.filter((item) => (item.explanation ?? '').trim() !== '').length,
    guards: guards.length,
    guardsExplained: guards.filter((guard) => (guard.note ?? '').trim() !== '').length,
  };
}
