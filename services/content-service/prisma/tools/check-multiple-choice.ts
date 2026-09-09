/**
 * Runs the shared kernel's engine over every new-form `multiple_choice` exercise in the
 * seed data, and reports what a teacher would be shown in the pre-assign gate.
 *
 * Four checks earn this file, and none of them is visible by eye in a JSON file:
 *
 * 1. **Every question is deliverable** — a stem, at least two options with text, and a
 *    key that is one of them. A question that fails is not an error anywhere: the
 *    projection silently drops it, so the set looks published and shows fewer questions
 *    than it holds.
 * 2. **The key names an option that exists.** `expectedAnswers` is a map from question id
 *    to option id, so a hand-edited file can point at an option that was renamed or
 *    deleted — and `fromPersisted` will read that as «no option is correct» rather than
 *    throwing. The same goes for a rebuttal written against an option id that is gone,
 *    and for a whole key block left behind by a deleted question.
 * 3. **Every question has a `why`.** This is the blocker the rewrite exists for: 48 of
 *    the 131 documents of the old form had no explanation at all, and a set that only
 *    ever says «not right» teaches nothing (plan 53 §2).
 * 4. **Nothing of the key reaches the student.** Every exercise, not a sample. The
 *    projection is built from the content column alone, which by construction holds no
 *    answer — so this check is really asking whether that construction still holds.
 *
 * The distractor audit runs over every set as well — it is part of `issues`, which is
 * the one engine every surface filters — and its flags are printed rather than counted
 * against the run. `Q_TWO_OPTIONS` — «two options is a coin toss» — fires on
 * every riktig/galt question in the course and is correct each time: plan 53 §8 Q6 decided
 * to let it speak rather than to add a field to the model in order to silence it.
 *
 * Documents of the old single-question form are counted and skipped (plan 53 §8 Q2 keeps
 * the reseed to the first lesson of `norsk-b1`; the other 121 stay live).
 *
 *   npx tsx prisma/tools/check-multiple-choice.ts
 *   npx tsx prisma/tools/check-multiple-choice.ts --file norsk-b1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  correctOption,
  coverage,
  filledOptions,
  fromPersisted,
  isAnswerable,
  isMultipleChoiceDocument,
  issues,
  readAnswers,
  toStudentProjection,
} from '@ssz/shared-kernel/multiple-choice';
import type { Issue } from '@ssz/shared-kernel/multiple-choice';

interface Exercise {
  key: string;
  template: string;
  instruction: string;
  content: unknown;
  expectedAnswers: unknown;
}

const DATA_DIR = join(process.cwd(), 'prisma', 'data');
/** Course → the language its content is written in, which is all the audit needs. */
const COURSES: Record<string, string> = { 'norsk-b1': 'nb', 'ny-i-norge-a2': 'nb' };

function main(): void {
  const only = process.argv.includes('--file')
    ? [process.argv[process.argv.indexOf('--file') + 1]!]
    : Object.keys(COURSES);

  let blockerCount = 0;
  let leakCount = 0;
  let danglingCount = 0;
  let seen = 0;
  let legacy = 0;

  for (const course of only) {
    const language = COURSES[course] ?? undefined;
    const file = join(DATA_DIR, course, 'exercises.json');
    const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, Exercise[]>;

    for (const [unit, items] of Object.entries(data)) {
      for (const ex of items) {
        if (ex.template !== 'multiple_choice') continue;
        if (!isMultipleChoiceDocument(ex.content)) {
          legacy += 1;
          continue;
        }
        seen += 1;

        const doc = fromPersisted(ex.content, ex.expectedAnswers);
        const found = issues(doc, { language });
        const blockers = found.filter((issue) => issue.level === 'blocker');
        const warnings = found.filter((issue) => issue.level !== 'blocker');
        const cover = coverage(doc, { language });

        // The key column read on its own, against the document it is supposed to key.
        // `fromPersisted` cannot report any of this: it resolves what matches and leaves
        // the rest as an option that is simply not marked correct.
        const persisted = readAnswers(ex.expectedAnswers);
        const dangling: string[] = [];
        for (const [questionId, key] of Object.entries(persisted.questions)) {
          const q = doc.questions.find((question) => question.id === questionId);
          if (q === undefined) {
            dangling.push(`key block for ${questionId}, which is not a question here`);
            continue;
          }
          if (!q.options.some((o) => o.id === key.correctOptionId)) {
            dangling.push(`${questionId} is keyed to «${key.correctOptionId}», which is not one of its options`);
          }
          for (const optionId of Object.keys(key.options)) {
            if (!q.options.some((o) => o.id === optionId)) {
              dangling.push(`rebuttal on ${questionId}/${optionId}, which is not one of its options`);
            }
          }
        }
        // Stated separately from `Q_NO_KEY` because the model makes a second key
        // unrepresentable — one option id per question — and a check that can only ever
        // pass is worth saying so out loud rather than leaving the reader to wonder.
        for (const q of doc.questions) {
          if (q.options.filter((o) => o.correct).length > 1) {
            dangling.push(`${q.id} has more than one key`);
          }
        }

        // Projected exactly as the runner receives it: from the content column alone.
        const projection = toStudentProjection(ex.content);
        const serialised = JSON.stringify(projection);
        // Checked as text rather than by field: an absent field is the claim, and only a
        // whole-payload search actually checks it. Option ids are not searched for — the
        // projection is supposed to carry all of them, which is exactly why the key is a
        // map living elsewhere and not a flag on the option.
        const leaks: string[] = [];
        if (/"correct/.test(serialised)) leaks.push('a field naming the correct option');
        for (const q of doc.questions) {
          if (q.why.trim() && serialised.includes(q.why)) leaks.push(`why of ${q.id}`);
          for (const o of q.options) {
            if (o.why.trim() && serialised.includes(o.why)) leaks.push(`rebuttal on ${q.id}/${o.id}`);
          }
          // The `listening` transcript is the author's note to themselves; showing it
          // answers the question (plan 53 §3.8).
          if (q.kind === 'listening' && q.context.trim()) {
            const shipped = projection.questions.find((p) => p.id === q.id)?.context ?? '';
            if (shipped.trim() !== '') leaks.push(`transcript of ${q.id}`);
          }
        }

        blockerCount += blockers.length;
        leakCount += leaks.length;
        danglingCount += dangling.length;

        const mark = blockers.length || dangling.length ? '✗' : leaks.length ? '!' : '✓';
        console.log(
          `${mark} ${course}/${unit} ${ex.key} — ${doc.questions.filter(isAnswerable).length}/` +
            `${doc.questions.length} questions deliverable, ` +
            `${cover.total - cover.noWhy}/${cover.total} with a rule, ` +
            `${cover.written}/${cover.wrongs} distractors answered back, ` +
            `${cover.clean}/${cover.total} clean of audit flags`,
        );

        for (const issue of blockers) console.log(`    BLOCKER ${issue.code} ${describe(issue)}`);
        for (const issue of warnings) console.log(`    warning ${issue.code} ${describe(issue)}`);
        for (const problem of dangling) console.log(`    DANGLING ${problem}`);
        for (const leak of leaks) console.log(`    LEAK    ${leak} reaches the student`);

        // Per question: the stem, the key, and which distractors still have nothing to
        // say. Printed so the set can be read as a set.
        for (const q of doc.questions) {
          const key = correctOption(q);
          const silent = filledOptions(q).filter((o) => !o.correct && o.why.trim() === '');
          console.log(
            `    ${q.id} [${q.kind}] ${q.stem}  → «${key?.text ?? '—'}»` +
              (silent.length ? `; no rebuttal on ${silent.map((o) => `«${o.text}»`).join(', ')}` : ''),
          );
        }
      }
    }
  }

  console.log(
    `\n${seen} new-form exercise(s) checked, ${legacy} still on the old form. ` +
      `${blockerCount} blocker(s), ${danglingCount} dangling reference(s), ${leakCount} leak(s).`,
  );
  if (blockerCount > 0 || danglingCount > 0 || leakCount > 0) process.exit(1);
}

/** The parameters an issue carries, for the ones whose ids are the diagnosis. */
function describe(issue: Issue): string {
  const parts: string[] = [];
  if ('questionId' in issue) parts.push(issue.questionId);
  if ('optionId' in issue) parts.push(`/${issue.optionId}`);
  if ('count' in issue) parts.push(`×${issue.count}`);
  return parts.join('');
}

main();
