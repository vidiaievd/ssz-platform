import type { AttemptModel } from '../../../../../generated/prisma/models/Attempt.js';
import { Attempt } from '../../domain/entities/attempt.entity.js';
import { readRubricMarks, readRubricSnapshot } from '@ssz/shared-kernel/writing-task';
import { readPlacement } from '../../../../shared/application/services/sentence-schema-rows.js';
import type {
  AnsweredQuestion,
  AttemptStatus,
  CheckedRow,
  CheckMode,
  DifficultyLevel,
  ExercisePathSnapshot,
  PracticedAtom,
  ReviewDecision,
} from '../../domain/entities/attempt.entity.js';

/**
 * Read the handed-in answers back, defensively.
 *
 * Read rather than cast, for the same reason the rubric columns below are: the domain
 * refuses a second answer to a question it already holds, and that refusal is only as
 * good as the list it checks against. A row that turned out to hold something else would
 * cast to a truthy array of undefined `questionId`s, and every repeat would slip through.
 * `answeredAt` is revived from its JSON string — a `Date` does not survive the column.
 */
function readAnsweredQuestions(value: unknown): AnsweredQuestion[] {
  if (!Array.isArray(value)) return [];

  const out: AnsweredQuestion[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { questionId, text, verdict, answeredAt } = raw as Record<string, unknown>;
    if (typeof questionId !== 'string' || questionId === '') continue;
    out.push({
      questionId,
      text: typeof text === 'string' ? text : '',
      verdict: verdict === 'pass' || verdict === 'partial' ? verdict : 'fail',
      answeredAt: typeof answeredAt === 'string' ? new Date(answeredAt) : new Date(0),
    });
  }
  return out;
}

/**
 * The per-sentence state of a `sentence_schema` set, read rather than cast.
 *
 * Same reason as the list above, with one field that matters more: `revealed` decides
 * whether the sentence scores at all, so a row that turned out to hold something else
 * must read as "not revealed and not solved" — an honest fresh sentence — rather than as
 * a truthy object whose flags are `undefined`. `checkedAt` is revived from its JSON
 * string; a `Date` does not survive the column.
 */
function readCheckedRows(value: unknown): CheckedRow[] {
  if (!Array.isArray(value)) return [];

  const out: CheckedRow[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { rowId, attempts, placement, solved, revealed, checkedAt } = raw as Record<
      string,
      unknown
    >;
    if (typeof rowId !== 'string' || rowId === '') continue;
    out.push({
      rowId,
      attempts: typeof attempts === 'number' && attempts > 0 ? attempts : 1,
      placement: readPlacement(placement) ?? {},
      solved: solved === true,
      revealed: revealed === true,
      checkedAt: typeof checkedAt === 'string' ? new Date(checkedAt) : new Date(0),
    });
  }
  return out;
}

export class AttemptMapper {
  static toDomain(row: AttemptModel): Attempt {
    return Attempt.reconstitute({
      id: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      assignmentId: row.assignmentId,
      enrollmentId: row.enrollmentId,
      templateCode: row.templateCode,
      targetLanguage: row.targetLanguage,
      difficultyLevel: row.difficultyLevel as DifficultyLevel,
      checkMode: row.checkMode as CheckMode,
      practicedAtoms: (row.practicedAtoms as PracticedAtom[] | null) ?? [],
      status: row.status as AttemptStatus,
      score: row.score,
      passed: row.passed,
      timeSpentSeconds: row.timeSpentSeconds,
      submittedAnswer: row.submittedAnswer,
      validationDetails: row.validationDetails,
      feedback: row.feedback,
      answerHash: row.answerHash,
      revisionCount: row.revisionCount,
      recheckCount: row.recheckCount,
      answersRevealed: row.answersRevealed,
      selfChecksUsed: row.selfChecksUsed,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      scoredAt: row.scoredAt,
      reviewedByUserId: row.reviewedByUserId,
      reviewedAt: row.reviewedAt,
      reviewComment: row.reviewComment,
      reviewDecisions: (row.reviewDecisions as ReviewDecision[] | null) ?? null,
      schoolId: row.schoolId,
      containerId: row.containerId,
      groupId: row.groupId,
      exercisePath: row.exercisePath as ExercisePathSnapshot | null,
      reviewClaimedBy: row.reviewClaimedBy,
      reviewClaimedAt: row.reviewClaimedAt,
      previousAttemptId: row.previousAttemptId,
      autoPassedItems: row.autoPassedItems,
      totalItems: row.totalItems,
      draftAnswer: row.draftAnswer,
      draftSavedAt: row.draftSavedAt,
      answeredQuestions: readAnsweredQuestions(row.answeredQuestions),
      checkedRows: readCheckedRows(row.checkedRows),
      // Read rather than cast, unlike the columns above. These two decide how the
      // submission is graded at all: a snapshot cast out of a JSON column that turned
      // out not to hold criteria would still be truthy, and the review handler would
      // take the rubric branch on it. The kernel's readers answer null for anything
      // that is not a usable rubric, which is the honest "grade this one out of items".
      rubricMarks: row.rubricMarks === null ? null : readRubricMarks(row.rubricMarks),
      rubricSnapshot: readRubricSnapshot(row.rubricSnapshot),
    });
  }

  static toPersistence(attempt: Attempt): AttemptModel {
    return {
      id: attempt.id,
      userId: attempt.userId,
      exerciseId: attempt.exerciseId,
      assignmentId: attempt.assignmentId,
      enrollmentId: attempt.enrollmentId,
      templateCode: attempt.templateCode,
      targetLanguage: attempt.targetLanguage,
      difficultyLevel: attempt.difficultyLevel as AttemptModel['difficultyLevel'],
      checkMode: attempt.checkMode as AttemptModel['checkMode'],
      practicedAtoms: attempt.practicedAtoms as unknown as AttemptModel['practicedAtoms'],
      status: attempt.status as AttemptModel['status'],
      score: attempt.scoreValue,
      passed: attempt.passed,
      timeSpentSeconds: attempt.timeSpentSeconds,
      submittedAnswer: attempt.submittedAnswer ?? null,
      validationDetails: attempt.validationDetails ?? null,
      feedback: attempt.feedback ?? null,
      answerHash: attempt.answerHash,
      revisionCount: attempt.revisionCount,
      recheckCount: attempt.recheckCount,
      answersRevealed: attempt.answersRevealed,
      selfChecksUsed: attempt.selfChecksUsed,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      scoredAt: attempt.scoredAt,
      reviewedByUserId: attempt.reviewedByUserId,
      reviewedAt: attempt.reviewedAt,
      reviewComment: attempt.reviewComment,
      reviewDecisions:
        attempt.reviewDecisions as unknown as AttemptModel['reviewDecisions'],
      schoolId: attempt.schoolId,
      containerId: attempt.containerId,
      groupId: attempt.groupId,
      exercisePath: attempt.exercisePath as unknown as AttemptModel['exercisePath'],
      reviewClaimedBy: attempt.reviewClaimedBy,
      reviewClaimedAt: attempt.reviewClaimedAt,
      previousAttemptId: attempt.previousAttemptId,
      autoPassedItems: attempt.autoPassedItems,
      totalItems: attempt.totalItems,
      draftAnswer: attempt.draftAnswer as AttemptModel['draftAnswer'],
      draftSavedAt: attempt.draftSavedAt,
      answeredQuestions:
        attempt.answeredQuestions as unknown as AttemptModel['answeredQuestions'],
      checkedRows: attempt.checkedRows as unknown as AttemptModel['checkedRows'],
      rubricMarks: attempt.rubricMarks as unknown as AttemptModel['rubricMarks'],
      rubricSnapshot: attempt.rubricSnapshot as unknown as AttemptModel['rubricSnapshot'],
    };
  }
}
