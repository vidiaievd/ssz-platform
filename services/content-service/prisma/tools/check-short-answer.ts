/**
 * Runs the shared kernel's engine over every new-form `short_answer` exercise in the
 * seed data, and reports what a teacher would be shown in the pre-assign gate.
 *
 * The check that earns this file is `modelPasses`: the author's own model answer, run
 * through the author's own key by the engine that will grade the students. A key whose
 * phrases match nothing does not error — it marks every correct answer as covering none
 * of the points, and the first person to notice is a student being told they were wrong.
 * Plan 50's equivalent tool found five of thirteen documents failing the same check.
 *
 * It also asserts the property no amount of authoring care can guarantee by eye: that
 * the student projection carries none of the answer key — no anchor phrase, no model
 * answer, no explanation, and no `listening` transcript. Every exercise is checked, not
 * a sample, because one leaked anchor list is the answer written out in the words the
 * student was asked to find.
 *
 * Documents of the old single-question form are counted and skipped (plan 51 §8 Q1).
 *
 *   npx tsx prisma/tools/check-short-answer.ts
 *   npx tsx prisma/tools/check-short-answer.ts --file norsk-b1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  coverage,
  fromPersisted,
  grade,
  isShortAnswerDocument,
  issues,
  modelPasses,
  toStudentProjection,
  usableElements,
} from '@ssz/shared-kernel/short-answer';

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
  let legacy = 0;

  for (const course of only) {
    const file = join(DATA_DIR, course, 'exercises.json');
    const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, Exercise[]>;

    for (const [unit, items] of Object.entries(data)) {
      for (const ex of items) {
        if (ex.template !== 'short_answer') continue;
        if (!isShortAnswerDocument(ex.content)) {
          legacy += 1;
          continue;
        }
        seen += 1;

        const doc = fromPersisted(ex.content, ex.expectedAnswers);
        const found = issues(doc);
        const blockers = found.filter((issue) => issue.level === 'blocker');
        const warnings = found.filter((issue) => issue.level === 'warning');
        const cover = coverage(doc);

        const projection = toStudentProjection(ex.content, ex.expectedAnswers);
        // Everything the student receives *except* the passages. The anchors are drawn
        // from the source text on purpose — «tre år» is in text 1A because that is where
        // the answer is — so searching the passage finds the reading comprehension
        // working, not a leak. What must not appear is key material carried as key
        // material: an element, a model answer, an explanation, or a transcript the
        // author wrote for themselves. A leak into `passage` is not possible: the
        // projection copies it from the content column, which never holds the key.
        const serialised = JSON.stringify({
          ...projection,
          questions: projection.questions.map(({ passage: _passage, ...rest }) => rest),
        });
        // Checked as text rather than by field: an absent field is the claim, and only
        // a whole-payload search actually checks it.
        const leaks: string[] = [];
        for (const q of doc.questions) {
          for (const element of q.elements) {
            for (const anchor of element.anchors) {
              if (anchor.trim() && serialised.includes(anchor)) leaks.push(`anchor «${anchor}»`);
            }
            if (element.label.trim() && serialised.includes(element.label)) {
              leaks.push(`label «${element.label}»`);
            }
          }
          if (q.why.trim() && serialised.includes(q.why)) leaks.push(`why of ${q.id}`);
          if (doc.settings.showModel !== 'always' && q.model.trim() && serialised.includes(q.model)) {
            leaks.push(`model answer of ${q.id}`);
          }
          // The transcript is the one passage that must not travel at all, so it is
          // checked against the projection proper rather than the stripped copy.
          if (q.kind === 'listening' && q.passage.trim()) {
            const shipped = projection.questions.find((p) => p.id === q.id)?.passage ?? '';
            if (shipped.trim() !== '') leaks.push(`transcript of ${q.id}`);
          }
        }

        blockerCount += blockers.length;
        leakCount += leaks.length;

        const mark = blockers.length ? '✗' : leaks.length ? '!' : '✓';
        console.log(
          `${mark} ${course}/${unit} ${ex.key} — ${doc.questions.length} questions, ` +
            `${cover.done}/${cover.total} model answers pass their key, ` +
            `${cover.anchors} phrases`,
        );

        for (const issue of blockers) console.log(`    BLOCKER ${issue.code} ${describe(issue)}`);
        for (const issue of warnings) console.log(`    warning ${issue.code} ${describe(issue)}`);
        for (const leak of leaks) console.log(`    LEAK    ${leak} reaches the student`);

        // Per question: what the author's own answer covers, and how far off it is when
        // it does not pass. "covers 1 of 2" is the whole diagnosis.
        for (const q of doc.questions) {
          if (usableElements(q).length === 0) continue;
          if (modelPasses(q, doc.settings)) continue;
          const result = grade(q, q.model, doc.settings);
          console.log(
            `    model of ${q.id} does not pass its own key — ` +
              `covers ${result.covered} of ${result.total}` +
              (result.tooShort ? ', and is too short' : '') +
              `; misses ${result.hits
                .filter((hit) => hit.required && hit.anchor === null)
                .map((hit) => `«${hit.label}»`)
                .join(', ')}`,
          );
        }
      }
    }
  }

  console.log(
    `\n${seen} new-form exercise(s) checked, ${legacy} still on the old form. ` +
      `${blockerCount} blocker(s), ${leakCount} leak(s).`,
  );
  if (blockerCount > 0 || leakCount > 0) process.exit(1);
}

/** The parameters an issue carries, for the ones whose numbers are the diagnosis. */
function describe(issue: ReturnType<typeof issues>[number]): string {
  if ('questionId' in issue) {
    const extra =
      issue.code === 'Q_MODEL_FAILS_KEY'
        ? ` (covers ${issue.covered} of ${issue.total})`
        : 'anchor' in issue
          ? ` («${issue.anchor}»)`
          : '';
    return `on ${issue.questionId}${'elementId' in issue ? `/${issue.elementId}` : ''}${extra}`;
  }
  return '';
}

main();
