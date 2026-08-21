/**
 * Runs the shared kernel's validation engine over every `match_pairs` exercise in the
 * seed data, and reports what a teacher would be shown in the pre-assign gate.
 *
 * This is the acceptance check for the content half of plan 49 phase 2. A blocker here
 * is the same blocker that stops `publish-version.handler.ts` from publishing the whole
 * container version, so "no blockers" is not a style opinion — it is the difference
 * between the course being assignable and not.
 *
 * It also asserts the one property no amount of authoring care can guarantee by eye:
 * that the student projection shares no identifier between a slot and a pool item, and
 * carries no answer text (AC-S15).
 *
 *   npx ts-node --transpile-only prisma/tools/check-match-pairs.ts
 *   npx ts-node --transpile-only prisma/tools/check-match-pairs.ts --file norsk-b1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  coverage,
  fromPersisted,
  issues,
  rightItems,
  toStudentProjection,
} from '@ssz/shared-kernel/match-pairs';

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
        if (ex.template !== 'match_pairs') continue;
        seen += 1;

        const doc = fromPersisted(
          { id: ex.key, moduleId: unit, title: ex.instruction, instructions: ex.instruction, updatedAt: '' },
          ex.content,
          ex.expectedAnswers,
        );

        const found = issues(doc);
        const blockers = found.filter((issue) => issue.level === 'blocker');
        const warnings = found.filter((issue) => issue.level === 'warning');
        const cov = coverage(doc);
        const pool = rightItems(doc);
        const extras = pool.filter((item) => item.kind === 'distractor').length;

        const projection = toStudentProjection(doc);
        const slotIds = new Set(projection.slots.map((slot) => slot.slotId));
        const shared = projection.pool.filter((item) => slotIds.has(item.itemId));
        const serialised = JSON.stringify(projection);
        const leaked = doc.pairs.filter(
          (pair) => pair.right.trim() !== '' && serialised.includes(`"itemId":"${pair.id}"`),
        );

        blockerCount += blockers.length;
        leakCount += shared.length + leaked.length;

        const mark = blockers.length > 0 ? 'FAIL' : warnings.length > 0 ? 'warn' : 'ok  ';
        console.log(
          `${mark} ${course}/${unit} ${ex.key} — ${doc.variant}, ` +
            `${doc.pairs.length} pairs, pool ${pool.length} (+${extras} extras), ` +
            `feedback ${cov.written}/${cov.total}, no default: ${cov.noDefault}`,
        );
        for (const issue of found) {
          console.log(`     ${issue.level.padEnd(7)} ${issue.code} ${describe(issue)}`);
        }
        if (shared.length > 0) {
          console.log(`     LEAK    slot and pool item share an id: ${shared.map((i) => i.itemId).join(', ')}`);
        }
      }
    }
  }

  console.log(`\n${seen} exercise(s): ${blockerCount} blocker(s), ${leakCount} id leak(s)`);
  if (blockerCount > 0 || leakCount > 0) process.exitCode = 1;
}

function describe(issue: Record<string, unknown>): string {
  const { code, level, step, ...rest } = issue;
  return Object.keys(rest).length > 0 ? JSON.stringify(rest) : '';
}

main();
