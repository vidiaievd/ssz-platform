/**
 * Word-level pre-check for transformation answers.
 *
 * Mirrors the web client's `short-answer-diff.ts` — the learner is shown the
 * same marks the server scores with, so a client-side pre-check and a stored
 * attempt can never disagree. Keep the two in step when either changes.
 */

export interface ShortAnswerKey {
  reference_answer: string;
  /** Every acceptable phrasing; the submission is scored against the closest. */
  accepted_answers?: string[];
}

/**
 * What happened at one position of the learner's answer. `form` is a
 * substitution the learner nearly got — same word, wrong ending (`begynte` for
 * `begynne`) — which is the mistake these exercises drill, so it is worth
 * separating from a plain wrong word.
 */
export type DiffOutcome = 'ok' | 'form' | 'wrong' | 'extra' | 'missing';

export interface DiffToken {
  outcome: DiffOutcome;
  /** What the learner wrote. Absent on `missing`. */
  submitted?: string;
  /** What belonged here. Absent on `extra`. */
  expected?: string;
}

export interface ShortAnswerDiff {
  /** true = exact, false = a near miss we can name, null = too far → review. */
  ok: boolean | null;
  /** 0–100: share of the expected words the learner placed correctly. */
  score: number;
  /** The accepted answer the submission was closest to. */
  target: string;
  /** The submission aligned against `target`, in reading order. */
  tokens: DiffToken[];
  /** Token-level edit distance to `target`. */
  distance: number;
  counts: Record<Exclude<DiffOutcome, 'ok'>, number>;
}

interface Token {
  raw: string;
  norm: string;
}

const LEADING = /^[«»"“”„'’([]+/;
const TRAILING = /[«»"“”„'’)\],.!?;:]+$/;

/** Compare words, not typography: case, quotes and edge punctuation drop out. */
function normToken(raw: string): string {
  return raw.toLowerCase().replace(LEADING, '').replace(TRAILING, '');
}

function tokenize(text: string): Token[] {
  return (text || '')
    .trim()
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normToken(raw) }))
    .filter((t) => t.norm !== '');
}

/**
 * An authored answer may mark an optional part in parentheses —
 * `Søppelet blir hentet (av kommunen).` Both readings are acceptable, so the
 * candidate is expanded into both rather than diffed against the literal text.
 */
function expandOptional(candidate: string): string[] {
  if (!candidate.includes('(')) return [candidate];
  const kept = candidate.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  const dropped = candidate.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return dropped === kept ? [kept] : [kept, dropped];
}

/** Character-level distance — only used to tell a typo from a new word. */
function charDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

/** Same stem, different ending — an inflection slip rather than another word. */
function isFormSlip(submitted: string, expected: string): boolean {
  const shortest = Math.min(submitted.length, expected.length);
  if (shortest < 3) return false;
  let shared = 0;
  while (shared < shortest && submitted[shared] === expected[shared]) shared += 1;
  if (shared >= 3) return true;
  return charDistance(submitted, expected) <= 2 && shortest >= 4;
}

/**
 * Align the submission against one candidate and read the edits back out.
 * Plain Levenshtein over tokens: a substitution, an insertion and a deletion
 * all cost 1, so the backtrace is the shortest story of what went wrong.
 */
function align(submitted: Token[], expected: Token[]): { tokens: DiffToken[]; distance: number } {
  const n = submitted.length;
  const m = expected.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 0; i <= n; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= m; j += 1) dp[0]![j] = j;

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const same = submitted[i - 1]!.norm === expected[j - 1]!.norm;
      dp[i]![j] = Math.min(
        dp[i - 1]![j - 1]! + (same ? 0 : 1),
        dp[i - 1]![j]! + 1, // the learner wrote a word that isn't expected
        dp[i]![j - 1]! + 1, // the learner skipped an expected word
      );
    }
  }

  const tokens: DiffToken[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const sub = submitted[i - 1];
    const exp = expected[j - 1];
    if (i > 0 && j > 0) {
      const same = sub!.norm === exp!.norm;
      if (dp[i]![j] === dp[i - 1]![j - 1]! + (same ? 0 : 1)) {
        tokens.push({
          outcome: same ? 'ok' : isFormSlip(sub!.norm, exp!.norm) ? 'form' : 'wrong',
          submitted: sub!.raw,
          expected: exp!.raw,
        });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      tokens.push({ outcome: 'extra', submitted: sub!.raw });
      i -= 1;
      continue;
    }
    tokens.push({ outcome: 'missing', expected: exp!.raw });
    j -= 1;
  }

  tokens.reverse();
  return { tokens, distance: dp[n]![m]! };
}

/**
 * How far off an answer may be and still be worth naming the mistake for.
 * Beyond it the learner probably wrote something else entirely — a valid
 * paraphrase or a misread task — which only a human can judge.
 */
function nearMissBudget(expectedLength: number): number {
  return Math.max(1, Math.floor(0.4 * expectedLength));
}

/**
 * Pre-check a transformation answer (indirect speech, passive, inversion …).
 *
 * These tasks have one intended rewrite, so the submission can be aligned
 * against it word by word: an exact match passes instantly, a small deviation
 * comes back named ("wrong form", "extra word", "missing word") instead of
 * silently waiting on a teacher, and only a genuinely different sentence is
 * still routed for review — a valid paraphrase must not be marked wrong.
 */
export function checkShortAnswer(expectedAnswers: ShortAnswerKey, value: string): ShortAnswerDiff {
  const empty: ShortAnswerDiff = {
    ok: null,
    score: 0,
    target: '',
    tokens: [],
    distance: 0,
    counts: { form: 0, wrong: 0, extra: 0, missing: 0 },
  };

  const candidates = [
    ...(expectedAnswers.accepted_answers ?? []),
    ...(expectedAnswers.reference_answer ? [expectedAnswers.reference_answer] : []),
  ].flatMap(expandOptional);

  const submitted = tokenize(value);
  if (candidates.length === 0 || submitted.length === 0) return empty;

  let best: (ShortAnswerDiff & { expectedLength: number }) | null = null;

  for (const candidate of candidates) {
    const expected = tokenize(candidate);
    if (expected.length === 0) continue;

    const { tokens, distance } = align(submitted, expected);
    if (best && distance >= best.distance) continue;

    const counts = { form: 0, wrong: 0, extra: 0, missing: 0 };
    let matched = 0;
    for (const token of tokens) {
      if (token.outcome === 'ok') matched += 1;
      else counts[token.outcome] += 1;
    }

    best = {
      ok: false,
      score: Math.round((100 * matched) / expected.length),
      target: candidate,
      tokens,
      distance,
      counts,
      expectedLength: expected.length,
    };

    if (distance === 0) break; // nothing can beat an exact match
  }

  if (!best) return empty;

  const { expectedLength, ...diff } = best;
  return {
    ...diff,
    ok: diff.distance === 0 ? true : diff.distance <= nearMissBudget(expectedLength) ? false : null,
    score: diff.distance === 0 ? 100 : diff.score,
  };
}
