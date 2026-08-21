/**
 * Runs the shared kernel's validation engine over every `writing_task` exercise in the
 * seed data, and reports what a teacher would be shown in the pre-assign gate.
 *
 * This is the acceptance check for the content half of plan 50 phase 2. A blocker here
 * is the same blocker `get-preflight` raises, so "no blockers" is the difference between
 * the course version publishing and not.
 *
 * It also asserts the property no amount of authoring care can guarantee by eye: that
 * the student projection carries none of the answer key — no model answer, no point
 * keywords, and no level descriptors unless the author asked for `showRubric: 'always'`.
 * Every seeded exercise is checked, not a sample, because a single leaked model answer
 * turns a writing task into a copying exercise.
 *
 *   npx tsx prisma/tools/check-writing-task.ts
 *   npx tsx prisma/tools/check-writing-task.ts --file norsk-b1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyse,
  fromPersisted,
  issues,
  rubricMax,
  toStudentProjection,
} from '@ssz/shared-kernel/writing-task';

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
  let seen = 0;

  for (const course of only) {
    const file = join(DATA_DIR, course, 'exercises.json');
    const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, Exercise[]>;

    for (const [unit, items] of Object.entries(data)) {
      for (const ex of items) {
        if (ex.template !== 'writing_task') continue;
        seen += 1;

        const doc = fromPersisted(
          { id: ex.key, moduleId: unit, title: ex.instruction, updatedAt: '' },
          ex.content,
          ex.expectedAnswers,
        );

        const found = issues(doc);
        const blockers = found.filter((issue) => issue.level === 'blocker');
        const warnings = found.filter((issue) => issue.level === 'warning');

        // The author's own example answer, measured by the engine the student's text
        // will be measured by. An example that covers three points out of four is the
        // clearest sign the task asks for more than it shows.
        const self = analyse(doc, doc.model);

        const projection = toStudentProjection(ex.content, ex.expectedAnswers);
        const serialised = JSON.stringify(projection);
        // The example answer and the descriptors are checked as text: neither has any
        // business in a student payload, whole or in part.
        //
        // Keywords are checked structurally instead. A keyword is a phrasing that would
        // satisfy a point, and an author who offers «Kari spurte om …» as a useful
        // opener has published that phrase deliberately — searching the payload for the
        // string would report the author's own help as a leak. What must not be there is
        // the mapping: which phrasings belong to which point.
        const leaked = [
          doc.model,
          ...(doc.settings.showRubric === 'always' ? [] : doc.rubric.flatMap((c) => c.levels)),
        ]
          .filter((text) => text.trim() !== '')
          .filter((text) => serialised.includes(text));
        if (projection.points.some((point) => 'keywords' in point)) {
          leaked.push('a projected point carries its keywords');
        }

        blockerCount += blockers.length;
        leakCount += leaked.length;

        const mark = blockers.length > 0 ? 'FAIL' : warnings.length > 0 ? 'warn' : 'ok  ';
        console.log(
          `${mark} ${course}/${unit} ${ex.key} — ${doc.mode}, ` +
            `${doc.points.length} points, ${doc.rubric.length} criteria, ` +
            `pass ${doc.settings.passScore}/${rubricMax(doc)}, ` +
            `${doc.settings.minWords}-${doc.settings.maxWords} words; ` +
            `example: ${self.words} words, ${self.paragraphs} paragraphs, ` +
            `${self.hitCount}/${self.neededCount} points covered`,
        );
        for (const issue of found) {
          console.log(`     ${issue.level.padEnd(7)} ${issue.code} ${describe(issue)}`);
        }
        for (const text of leaked) {
          console.log(`     LEAK    student payload contains «${text.slice(0, 40)}…»`);
        }
      }
    }
  }

  console.log(`\n${seen} exercise(s): ${blockerCount} blocker(s), ${leakCount} leak(s)`);
  if (blockerCount > 0 || leakCount > 0) process.exitCode = 1;
}

function describe(issue: Record<string, unknown>): string {
  const { code, level, step, ...rest } = issue;
  return Object.keys(rest).length > 0 ? JSON.stringify(rest) : '';
}

main();
