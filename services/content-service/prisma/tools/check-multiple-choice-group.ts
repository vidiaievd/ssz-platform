/**
 * Runs the shared kernel's engine over every new-form `multiple_choice_group` exercise in
 * the seed data, and reports what a teacher would be shown in the pre-assign gate.
 *
 * Four checks earn this file, and none of them is visible by eye in a JSON file:
 *
 * 1. **Every statement is deliverable** — text, and a column marked in the key. A row that
 *    fails is not an error anywhere: `readyRows` drops it, so the table publishes clean
 *    and shows fewer statements than the author wrote. That is the whole failure mode of
 *    this type, and it is silent from both ends — the author sees their row in the file,
 *    the student sees a shorter table.
 * 2. **The key names a column that exists.** `expected_answers.rows` is a map from row id
 *    to column id, so a hand-edited file can point at a column that was renamed, or carry
 *    a key block for a row that was deleted. `fromPersisted` reports neither: it reads an
 *    unresolvable id as «not answered», which is the same thing as a row nobody finished.
 * 3. **A quote is really in the passage.** The runner highlights it with `<mark>`, so a
 *    quote that is not literally there highlights nothing and the author is never told.
 * 4. **Nothing of the key reaches the student.** Every exercise, not a sample — and the
 *    quotes make this check less obvious than it looks. A quote is a line *of the passage*,
 *    which the projection is supposed to ship, so searching the payload for its text would
 *    find the passage and prove nothing. The search runs over the payload with the passage
 *    removed.
 *
 * The statement audit runs as well — it is part of `issues`, the one engine every surface
 * filters — and its flags are printed rather than counted against the run. On a four-row
 * table several of them are near-permanent (plan 54 §6.1), which is a reason to read them
 * rather than a reason to silence them.
 *
 * Documents of the old form are counted and skipped.
 *
 *   npx tsx prisma/tools/check-multiple-choice-group.ts
 *   npx tsx prisma/tools/check-multiple-choice-group.ts --file norsk-b1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  balance,
  column,
  coverage,
  fromPersisted,
  isMultipleChoiceGroupDocument,
  issues,
  quoteFound,
  readAnswers,
  readyRows,
  toStudentProjection,
  writtenRows,
} from '@ssz/shared-kernel/multiple-choice-group';
import type { Issue } from '@ssz/shared-kernel/multiple-choice-group';

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
        if (ex.template !== 'multiple_choice_group') continue;
        if (!isMultipleChoiceGroupDocument(ex.content)) {
          legacy += 1;
          continue;
        }
        seen += 1;

        const doc = fromPersisted(ex.content, ex.expectedAnswers);
        const found = issues(doc, { language });
        const blockers = found.filter((issue) => issue.level === 'blocker');
        const warnings = found.filter((issue) => issue.level !== 'blocker');
        const ready = readyRows(doc);
        const spread = balance(doc);
        const cover = coverage(doc);

        // The key column read on its own, against the document it is supposed to key.
        const persisted = readAnswers(ex.expectedAnswers);
        const dangling: string[] = [];
        for (const [rowId, key] of Object.entries(persisted.rows)) {
          const row = doc.rows.find((r) => r.id === rowId);
          if (row === undefined) {
            dangling.push(`key block for ${rowId}, which is not a statement here`);
            continue;
          }
          if (key.answer !== null && column(doc, key.answer) === null) {
            dangling.push(`${rowId} is keyed to «${key.answer}», which is not one of the columns`);
          }
          if (
            doc.source.mode === 'inline' &&
            key.quote.trim() !== '' &&
            !quoteFound(doc.source.text, key.quote)
          ) {
            dangling.push(`quote on ${rowId} is not a line of the passage`);
          }
        }
        for (const row of writtenRows(doc)) {
          if (persisted.rows[row.id] === undefined) {
            dangling.push(`${row.id} has no key block at all, so it never reaches a student`);
          }
        }

        // Projected exactly as the runner receives it, from both columns — this type
        // needs the key in order to know which rows are finished.
        const projection = toStudentProjection(ex.content, ex.expectedAnswers);
        const serialised = JSON.stringify(projection);
        // The passage is taken out before the text search: the projection is *supposed*
        // to ship it, and every quote is a substring of it, so a search over the whole
        // payload would report the passage as a leak of every quote in the table.
        const withoutPassage = JSON.stringify({ ...projection, source: { ...projection.source, text: '' } });

        const leaks: string[] = [];
        // Field names, because an absent field is the claim this projection makes.
        for (const field of ['"answer"', '"why"', '"quote"']) {
          if (serialised.includes(field)) leaks.push(`a ${field} field`);
        }
        for (const row of doc.rows) {
          if (row.why.trim() && serialised.includes(row.why)) leaks.push(`why of ${row.id}`);
          if (row.quote.trim() && withoutPassage.includes(row.quote)) leaks.push(`quote of ${row.id}`);
        }

        blockerCount += blockers.length;
        leakCount += leaks.length;
        danglingCount += dangling.length;

        const mark = blockers.length || dangling.length ? '✗' : leaks.length ? '!' : '✓';
        console.log(
          `${mark} ${course}/${unit} ${ex.key} — ${ready.length}/${doc.rows.length} statements deliverable, ` +
            `${cover.written}/${cover.total} explained, ${cover.quoted}/${cover.total} quoting the text, ` +
            `spread ${spread.counts.map((c) => `${c.column.short}:${c.n}`).join(' ')}` +
            `${spread.top ? ` (top ${Math.round(spread.topShare * 100)}%)` : ''}`,
        );

        for (const issue of blockers) console.log(`    BLOCKER ${issue.code} ${describe(issue)}`);
        for (const issue of warnings) console.log(`    ${issue.level === 'warning' ? 'warning' : 'info   '} ${issue.code} ${describe(issue)}`);
        for (const problem of dangling) console.log(`    DANGLING ${problem}`);
        for (const leak of leaks) console.log(`    LEAK    ${leak} reaches the student`);

        // Per statement: the text, the column it belongs in, and what is still missing.
        for (const row of doc.rows) {
          const key = column(doc, row.answer);
          const missing = [
            row.why.trim() === '' ? 'no why' : null,
            doc.source.mode === 'inline' && row.quote.trim() === '' ? 'no quote' : null,
          ].filter((m): m is string => m !== null);
          console.log(
            `    ${row.id} ${row.text || '(empty)'}  → «${key?.label ?? '—'}»` +
              (missing.length ? `; ${missing.join(', ')}` : ''),
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
  if ('rowId' in issue) parts.push(issue.rowId);
  if ('columnId' in issue) parts.push(issue.columnId);
  if ('count' in issue) parts.push(`×${issue.count}`);
  if ('length' in issue) parts.push(`${issue.length} chars`);
  if ('share' in issue) parts.push(`${Math.round(issue.share * 100)}%`);
  if ('threshold' in issue) parts.push(`${issue.threshold}%`);
  return parts.join(' ');
}

main();
