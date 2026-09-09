import { toAttemptDto } from '../../../src/modules/attempts/presentation/controllers/attempts.controller.js';
import {
  Attempt,
  type AttemptPersistenceProps,
  type AttemptStatus,
} from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

const SNAPSHOT = {
  criteria: [
    {
      id: 'c1',
      name: 'Innhold',
      desc: 'Alle punktene er med',
      weight: 2 as const,
      levels: ['Mangler', 'Delvis', 'Bra', 'Utmerket'] as [string, string, string, string],
    },
  ],
  passScore: 4,
};

function attempt(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'att-1',
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'writing_task',
    targetLanguage: 'nb',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW' as AttemptStatus,
    score: null,
    passed: null,
    timeSpentSeconds: 600,
    submittedAnswer: { text: 'Hei Kari, …' },
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-08-21T10:00:00Z'),
    submittedAt: new Date('2026-08-21T10:20:00Z'),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: 'school-1',
    containerId: null,
    groupId: null,
    exercisePath: null,
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    draftAnswer: null,
    draftSavedAt: null,
    rubricMarks: null,
    rubricSnapshot: null,
    ...props,
  });
}

describe('toAttemptDto — the rubric a learner may read', () => {
  it('withholds the rubric while the submission is still waiting', () => {
    // The criteria are queued with the work, long before anyone marks it. Sending them
    // now would hand the learner the level descriptors — which live in the answer key
    // exactly because they must not be read while writing — and the marks would be a
    // row of nulls that a card could only draw as zeroes.
    const dto = toAttemptDto(attempt({ rubricSnapshot: SNAPSHOT }));

    expect(dto.rubricSnapshot).toBeNull();
    expect(dto.rubricMarks).toBeNull();
  });

  it('sends the rubric and the marks once a teacher has decided', () => {
    const dto = toAttemptDto(
      attempt({
        status: 'SCORED' as AttemptStatus,
        score: 60,
        passed: true,
        reviewedByUserId: 'teacher-1',
        reviewedAt: new Date('2026-08-21T18:00:00Z'),
        rubricSnapshot: SNAPSHOT,
        rubricMarks: { c1: 3 },
      }),
    );

    expect(dto.rubricMarks).toEqual({ c1: 3 });
    // Whole, descriptors included: after the mark they are the explanation of it.
    expect(dto.rubricSnapshot).toMatchObject({ passScore: 4 });
  });

  it('reports no rubric at all for the templates graded per item', () => {
    const dto = toAttemptDto(
      attempt({
        templateCode: 'short_answer',
        status: 'SCORED' as AttemptStatus,
        reviewedByUserId: 'teacher-1',
        reviewedAt: new Date('2026-08-21T18:00:00Z'),
      }),
    );

    expect(dto.rubricSnapshot).toBeNull();
    expect(dto.rubricMarks).toBeNull();
  });
});

describe('toAttemptDto — the questions already handed in', () => {
  it('reads back the learner\'s own answers and the verdicts they were shown', () => {
    const dto = toAttemptDto(
      attempt({
        templateCode: 'short_answer',
        answeredQuestions: [
          {
            questionId: 'q1',
            text: 'I tre år.',
            verdict: 'pass',
            answeredAt: new Date('2026-08-21T10:05:00Z'),
          },
        ],
      }),
    );

    // No `answeredAt`: a runner re-entering the set needs what was written and how it
    // was judged, and the timestamp is the queue's business (plan 51 §8 Q6).
    expect(dto.answeredQuestions).toEqual([
      { questionId: 'q1', text: 'I tre år.', verdict: 'pass' },
    ]);
  });

  it('is empty for a template that answers nothing before it closes', () => {
    expect(toAttemptDto(attempt()).answeredQuestions).toEqual([]);
  });
});
