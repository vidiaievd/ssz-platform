/**
 * Runs the shared kernel's engine over every new-form `sentence_schema` exercise in the
 * seed data, and reports what a teacher would be shown in the pre-assign gate.
 *
 * Three checks earn this file, and none of them is visible by eye in a JSON file:
 *
 * 1. **Every sentence is deliverable.** A row with a word left outside the schema has no
 *    key, so the student projection drops it — the exercise looks published and shows
 *    fewer sentences than it holds, or an empty board. Nothing errors.
 * 2. **`row.text` is the chunks, in order.** The text is the sentence written out and the
 *    chunks are what the student assembles; if they disagree, the reveal shows one
 *    sentence and the board another. The runner never re-tokenizes, so nothing else would
 *    ever notice.
 * 3. **Nothing of the key reaches the student.** Every exercise, not a sample: one leaked
 *    `chunk.field` map is the whole answer, and so is `row.text`.
 *
 * Documents of the old form are counted and skipped (plan 52 §8 Q3).
 *
 *   npx tsx prisma/tools/check-sentence-schema.ts
 *   npx tsx prisma/tools/check-sentence-schema.ts --file norsk-b1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deliverableRows,
  fieldsFor,
  fromPersisted,
  grade,
  isSentenceSchemaDocument,
  issues,
  passes,
  solution,
  toStudentProjection,
} from '@ssz/shared-kernel/sentence-schema';
import type { Issue } from '@ssz/shared-kernel/sentence-schema';

interface Exercise {
  key: string;
  template: string;
  instruction: string;
  content: unknown;
  expectedAnswers: unknown;
}

const DATA_DIR = join(process.cwd(), 'prisma', 'data');
const COURSES = ['norsk-b1', 'ny-i-norge-a2'];

function main(): void {
  const only = process.argv.includes('--file')
    ? [process.argv[process.argv.indexOf('--file') + 1]!]
    : COURSES;

  let blockerCount = 0;
  let leakCount = 0;
  let mismatchCount = 0;
  let seen = 0;
  let legacy = 0;

  for (const course of only) {
    const file = join(DATA_DIR, course, 'exercises.json');
    const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, Exercise[]>;

    for (const [unit, items] of Object.entries(data)) {
      for (const ex of items) {
        if (ex.template !== 'sentence_schema') continue;
        if (!isSentenceSchemaDocument(ex.content)) {
          legacy += 1;
          continue;
        }
        seen += 1;

        const doc = fromPersisted(ex.content, ex.expectedAnswers);
        const found = issues(doc);
        const blockers = found.filter((issue) => issue.level === 'blocker');
        const warnings = found.filter((issue) => issue.level === 'warning');
        const green = passes(doc);

        // The sentence against its own pieces. Joined by a single space, which is how the
        // tokenizer splits it — so a double space or a stray comma shows up here.
        const mismatches = doc.rows
          .filter((row) => row.chunks.map((c) => c.text).join(' ') !== row.text.trim())
          .map((row) => row.id);

        // The author's own key, played back through the grader that will mark the
        // students. It must come out solved: if the key cannot solve its own sentence,
        // nothing a student places ever will.
        const unsolvable = deliverableRows(doc).filter((row) => {
          const marks = grade(row, fieldsFor(doc, row), solution(row), doc.settings);
          return !marks.solved;
        });

        const projection = toStudentProjection(doc);
        const serialised = JSON.stringify(projection);
        // Checked as text rather than by field: an absent field is the claim, and only a
        // whole-payload search actually checks it. The chunk *texts* are the bank and are
        // supposed to be there; what must not appear is the sentence they spell out, the
        // rule, the notes, or any field id paired with a chunk id.
        const leaks: string[] = [];
        for (const row of doc.rows) {
          if (row.text.trim() && serialised.includes(row.text)) leaks.push(`text of ${row.id}`);
          if (row.why.trim() && serialised.includes(row.why)) leaks.push(`why of ${row.id}`);
          for (const [chunkId, note] of Object.entries(row.fb)) {
            if (note.trim() && serialised.includes(note)) leaks.push(`note on ${chunkId}`);
          }
          for (const chunk of row.chunks) {
            if (chunk.field && serialised.includes(`"${chunk.id}":"${chunk.field}"`)) {
              leaks.push(`placement of ${chunk.id}`);
            }
          }
        }

        blockerCount += blockers.length;
        leakCount += leaks.length;
        mismatchCount += mismatches.length + unsolvable.length;

        const mark = blockers.length || unsolvable.length || mismatches.length
          ? '✗'
          : leaks.length
            ? '!'
            : '✓';
        console.log(
          `${mark} ${course}/${unit} ${ex.key} — ${green.deliverableRows}/${doc.rows.length} ` +
            `sentences deliverable, clauses ${green.clausesCovered.join('+') || '—'}, ` +
            `${green.rowsWithAlternatives} with alternatives, ${green.chunkNotes} chunk note(s), ` +
            `${doc.rows.reduce((n, r) => n + r.extras.length, 0)} distractor(s)`,
        );

        for (const issue of blockers) console.log(`    BLOCKER ${issue.code} ${describe(issue)}`);
        for (const issue of warnings) console.log(`    warning ${issue.code} ${describe(issue)}`);
        for (const rowId of mismatches) {
          const row = doc.rows.find((r) => r.id === rowId)!;
          console.log(
            `    MISMATCH ${rowId} — text «${row.text}» is not its chunks ` +
              `«${row.chunks.map((c) => c.text).join(' ')}»`,
          );
        }
        for (const row of unsolvable) {
          console.log(`    UNSOLVABLE ${row.id} — the key does not solve its own sentence`);
        }
        for (const leak of leaks) console.log(`    LEAK    ${leak} reaches the student`);

        // Per sentence, what the student is asked to do: the prompt they start from, and
        // the pieces they get. Printed so the set can be read as a set.
        for (const row of deliverableRows(doc)) {
          const bank = projection.rows.find((r) => r.id === row.id)?.bank ?? [];
          console.log(
            `    ${row.id} ${row.source ? `${row.source} → ` : ''}${row.text}` +
              `  [${bank.map((i) => i.text).join(' · ')}]`,
          );
        }
      }
    }
  }

  console.log(
    `\n${seen} new-form exercise(s) checked, ${legacy} still on the old form. ` +
      `${blockerCount} blocker(s), ${mismatchCount} inconsistenc(ies), ${leakCount} leak(s).`,
  );
  if (blockerCount > 0 || leakCount > 0 || mismatchCount > 0) process.exit(1);
}

/** The parameters an issue carries, for the ones whose numbers are the diagnosis. */
function describe(issue: Issue): string {
  const parts: string[] = [];
  if ('rowId' in issue) parts.push(issue.rowId);
  if ('clause' in issue) parts.push(issue.clause);
  if ('fieldId' in issue) parts.push(issue.fieldId);
  if ('count' in issue) parts.push(`×${issue.count}`);
  return parts.join(' ');
}

main();
