/**
 * Merges runs of single-blank `fill_in_blank` exercises into one
 * `word_bank_fill` block.
 *
 * A printed workbook drill ("insert at / om / a question word", ten sentences)
 * was seeded as ten separate exercises, so the learner checks each sentence on
 * its own. `word_bank_fill` already models exactly this: a shared bank, N
 * sentences, one check, per-blank grading. This tool rewrites the seed data to
 * use it, leaving genuinely independent gap-fills alone.
 *
 * A run is merged only when every exercise in it agrees on the word bank, the
 * instruction, the hint and the explanation — anything else is a different
 * exercise that merely looks similar, and it is left untouched.
 *
 * Dry-run by default:
 *   npx ts-node --transpile-only prisma/tools/merge-fill-runs.ts
 *   npx ts-node --transpile-only prisma/tools/merge-fill-runs.ts --groups 1 --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Blank {
  blank_id: number;
  accepted_answers: string[];
  rationale?: unknown;
}

interface Exercise {
  key: string;
  template: string;
  instruction: string;
  hint?: string;
  content: {
    text_with_blanks?: string;
    word_bank?: string[];
    items?: Array<{ id: string; text_with_blanks: string }>;
    reusable_words?: boolean;
    [k: string]: unknown;
  };
  expectedAnswers: {
    blanks?: Blank[];
    items?: Array<{ id: string; blanks: Blank[] }>;
    explanation?: string;
    [k: string]: unknown;
  };
}

type ExerciseFile = Record<string, Exercise[]>;

// Resolved like the seeds do — run from the content-service package root.
const DEFAULT_FILE = join(process.cwd(), 'prisma', 'data', 'norsk-b1', 'exercises.json');

/* ── args ─────────────────────────────────────────────────────────── */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const file = arg('file') ?? DEFAULT_FILE;
const onlyGroups = arg('groups')?.split(',').map((g) => g.trim());
const minRun = Number(arg('min') ?? 2);
const write = process.argv.includes('--write');

/* ── merge rules ──────────────────────────────────────────────────── */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only the fields this tool knows how to carry over may be present. */
const KNOWN_CONTENT_KEYS = new Set(['text_with_blanks', 'word_bank']);

function isMergeable(ex: Exercise): boolean {
  if (ex.template !== 'fill_in_blank') return false;
  const bank = ex.content.word_bank;
  if (!Array.isArray(bank) || bank.length < 2) return false;
  if (Object.keys(ex.content).some((k) => !KNOWN_CONTENT_KEYS.has(k))) return false;
  return Array.isArray(ex.expectedAnswers.blanks) && ex.expectedAnswers.blanks.length > 0;
}

/** Two neighbours belong to the same drill when everything but the sentence matches. */
function continues(prev: Exercise, next: Exercise): boolean {
  return (
    same(prev.content.word_bank, next.content.word_bank) &&
    prev.instruction === next.instruction &&
    prev.hint === next.hint &&
    prev.expectedAnswers.explanation === next.expectedAnswers.explanation
  );
}

export function findRuns(list: Exercise[], min: number): Exercise[][] {
  const runs: Exercise[][] = [];
  let run: Exercise[] = [];
  const flush = () => {
    if (run.length >= min) runs.push(run);
    run = [];
  };

  for (const ex of list) {
    if (!isMergeable(ex)) {
      flush();
      continue;
    }
    if (run.length > 0 && !continues(run[run.length - 1]!, ex)) flush();
    run.push(ex);
  }
  flush();
  return runs;
}

const blankMarkers = (text: string): number[] =>
  [...text.matchAll(/___(\d+)___/g)].map((m) => Number(m[1]));

/**
 * `b1-g1-fib-01` → `b1-g1-wbf-01`. Uniqueness matters: some leksjoner already
 * ship a hand-authored `-wbf-01`, and two exercises sharing a key would collide
 * in the seeder's uuidv5 namespace.
 */
export function mergedKey(firstKey: string, taken: Set<string>): string {
  const base = /-fib-\d+$/.test(firstKey)
    ? firstKey.replace(/-fib-(\d+)$/, '-wbf-$1')
    : `${firstKey}-wbf`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = base.replace(/(\d+)$/, (d) => String(Number(d) + n - 1));
    if (!taken.has(candidate)) return candidate;
  }
}

export function mergeRun(run: Exercise[], key: string): Exercise {
  const first = run[0]!;
  const items = run.map((ex, i) => ({
    id: String(i + 1),
    text_with_blanks: ex.content.text_with_blanks!,
  }));
  const answerItems = run.map((ex, i) => ({
    id: String(i + 1),
    blanks: ex.expectedAnswers.blanks!,
  }));

  /* One bank word answering several blanks must not be dimmed as "spent". */
  const firstAnswers = answerItems.flatMap((it) =>
    it.blanks.map((b) => (b.accepted_answers[0] ?? '').toLowerCase()),
  );
  const reusable = new Set(firstAnswers).size < firstAnswers.length;

  return {
    key,
    template: 'word_bank_fill',
    instruction: first.instruction,
    ...(first.hint !== undefined ? { hint: first.hint } : {}),
    content: {
      word_bank: first.content.word_bank!,
      items,
      ...(reusable ? { reusable_words: true } : {}),
    },
    expectedAnswers: {
      items: answerItems,
      ...(first.expectedAnswers.explanation !== undefined
        ? { explanation: first.expectedAnswers.explanation }
        : {}),
    },
  };
}

/** Every sentence must declare exactly the blanks its expected answers grade. */
function verify(merged: Exercise): string[] {
  const problems: string[] = [];
  for (const item of merged.content.items ?? []) {
    const markers = blankMarkers(item.text_with_blanks);
    const graded = (merged.expectedAnswers.items ?? [])
      .find((it) => it.id === item.id)
      ?.blanks.map((b) => b.blank_id);
    if (!same([...markers].sort(), [...(graded ?? [])].sort())) {
      problems.push(`item ${item.id}: markers ${markers.join(',')} vs graded ${(graded ?? []).join(',')}`);
    }
  }
  return problems;
}

/* ── run ──────────────────────────────────────────────────────────── */

function main(): void {
  const data = JSON.parse(readFileSync(file, 'utf-8')) as ExerciseFile;
  const taken = new Set(Object.values(data).flatMap((list) => list.map((e) => e.key)));

  let mergedCount = 0;
  let removedCount = 0;

  for (const [group, list] of Object.entries(data)) {
    if (onlyGroups && !onlyGroups.includes(group)) continue;

    for (const run of findRuns(list, minRun)) {
      const key = mergedKey(run[0]!.key, taken);
      const merged = mergeRun(run, key);
      const problems = verify(merged);
      if (problems.length > 0) {
        console.warn(`! ${group}: skipped ${run[0]!.key}… — ${problems.join('; ')}`);
        continue;
      }

      const at = list.indexOf(run[0]!);
      list.splice(at, run.length, merged);
      taken.add(key);
      mergedCount += 1;
      removedCount += run.length;

      const reuse = merged.content.reusable_words ? ', reusable words' : '';
      console.log(
        `${group}: ${run.length} × fill_in_blank → ${key} (${run[0]!.key}…${run[run.length - 1]!.key}${reuse})`,
      );
    }
  }

  console.log(
    `\n${mergedCount} block(s) replacing ${removedCount} exercises${write ? '' : ' — dry run, pass --write to apply'}`,
  );
  if (write) {
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    console.log(`written: ${file}`);
  }
}

main();
