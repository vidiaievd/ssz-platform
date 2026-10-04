import { derivedTargetsOf } from '@ssz/shared-kernel/exercise-items';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

/**
 * Targets a document makes by itself — plan 69, decision Q1-B.
 *
 * A row of an `inflection_table` pulled from the course dictionary names its word on every cell it
 * asks, as `context`. Never written to `exercise_item_targets`: read off the document each time, so
 * a row edited or removed takes its addresses with it. Every reader that answers «what does this
 * exercise train» — the attempt envelope, the axes, the course's atom coverage — joins these to the
 * author's rows; the targets panel and its suggestions do not, because they list what the author
 * can edit.
 *
 * Spelt as Prisma returns a target row — enum member NAMES (`VOCABULARY_ITEM`, `CONTEXT`) — so a
 * reader concatenates them with its own rows and maps both the same way.
 */
export interface DerivedTargetRow {
  exerciseId: string;
  itemKey: string;
  atomType: 'VOCABULARY_ITEM';
  atomId: string;
  role: 'CONTEXT';
}

/** Only this template derives anything; the query does not load the others' documents. */
const DERIVING_TEMPLATES = ['inflection_table'];

export async function derivedTargetRows(
  prisma: Pick<PrismaService, 'exercise'>,
  exerciseIds: readonly string[],
  scope: 'live' | 'draft' = 'live',
): Promise<DerivedTargetRow[]> {
  if (exerciseIds.length === 0) return [];
  const exercises = await prisma.exercise.findMany({
    where: {
      id: { in: [...exerciseIds] },
      deletedAt: null,
      template: { code: { in: DERIVING_TEMPLATES } },
    },
    select: {
      id: true,
      content: true,
      expectedAnswers: true,
      draftContent: true,
      draftExpectedAnswers: true,
      draftUpdatedAt: true,
      template: { select: { code: true } },
    },
  });

  const out: DerivedTargetRow[] = [];
  for (const exercise of exercises) {
    const code = exercise.template?.code;
    if (code === undefined || !DERIVING_TEMPLATES.includes(code)) continue;
    // The draft columns hold a document only when `draft_updated_at` is set (as the axes read it).
    const draft = scope === 'draft' && exercise.draftUpdatedAt !== null;
    const content = draft ? exercise.draftContent : exercise.content;
    const expected = draft ? exercise.draftExpectedAnswers : exercise.expectedAnswers;
    for (const target of derivedTargetsOf(code, content, expected)) {
      out.push({
        exerciseId: exercise.id,
        itemKey: target.itemKey,
        atomType: 'VOCABULARY_ITEM',
        atomId: target.atomId,
        role: 'CONTEXT',
      });
    }
  }
  return out;
}

/**
 * The author's rows and the derived ones, without a derived row the author already wrote. An
 * explicit row wins whatever its role: the author may have said the word is the focus.
 */
export function withDerived<
  T extends { exerciseId: string; itemKey: string | null; atomType: string; atomId: string },
>(rows: readonly T[], derived: readonly DerivedTargetRow[]): Array<T | DerivedTargetRow> {
  const key = (r: {
    exerciseId: string;
    itemKey: string | null;
    atomType: string;
    atomId: string;
  }) => `${r.exerciseId}|${r.itemKey ?? ''}|${r.atomType}|${r.atomId}`;
  const seen = new Set(rows.map(key));
  return [...rows, ...derived.filter((d) => !seen.has(key(d)))];
}
