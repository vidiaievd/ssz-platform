import { jest } from '@jest/globals';
import { ListMyMistakesHandler } from '../../../src/modules/attempts/application/queries/list-my-mistakes/list-my-mistakes.handler.js';
import { ListMyMistakesQuery } from '../../../src/modules/attempts/application/queries/list-my-mistakes/list-my-mistakes.query.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import type { IAttemptRepository } from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import {
  ContentClientError,
  type IContentClient,
} from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

const USER = 'student-1';
const SCORED_AT = new Date('2026-10-27T18:00:00Z');

function attempt(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'att-1',
    userId: USER,
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'word_bank_gap_fill',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: 'SCORED',
    score: 40,
    passed: false,
    timeSpentSeconds: 60,
    // Present only to prove the result never carries it.
    submittedAnswer: { answers: [{ itemId: 'i1', text: 'the actual answer' }] },
    validationDetails: { reference: 'do not leak me' },
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-10-27T17:58:00Z'),
    submittedAt: SCORED_AT,
    scoredAt: SCORED_AT,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: null,
    containerId: 'course-1',
    groupId: null,
    exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien', moduleId: 'module-1' },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

function makeHandler(attempts: Attempt[], total: number, placement?: Result<any, ContentClientError>) {
  const findLatestMistakes = jest
    .fn<IAttemptRepository['findLatestMistakes']>()
    .mockResolvedValue({ attempts, total });
  const getExercisePlacement = jest
    .fn<IContentClient['getExercisePlacement']>()
    .mockResolvedValue(placement ?? Result.fail(new ContentClientError(404, 'not found')));
  const handler = new ListMyMistakesHandler(
    { findLatestMistakes } as unknown as IAttemptRepository,
    { getExercisePlacement } as unknown as IContentClient,
  );
  return { handler, findLatestMistakes, getExercisePlacement };
}

describe('ListMyMistakesHandler', () => {
  it('maps the rows field by field and passes the scope through', async () => {
    const { handler, findLatestMistakes, getExercisePlacement } = makeHandler([attempt()], 5);

    const result = await handler.execute(new ListMyMistakesQuery(USER, 'course-1', 3));

    expect(findLatestMistakes).toHaveBeenCalledWith(USER, { courseId: 'course-1', limit: 3 });
    expect(getExercisePlacement).not.toHaveBeenCalled();
    expect(result).toEqual({
      total: 5,
      items: [
        {
          attemptId: 'att-1',
          exerciseId: 'ex-1',
          templateCode: 'word_bank_gap_fill',
          targetLanguage: 'nb',
          containerId: 'course-1',
          unitId: 'module-1',
          exerciseTitle: 'Familien',
          score: 40,
          attemptedAt: SCORED_AT,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('actual answer');
    expect(JSON.stringify(result)).not.toContain('do not leak me');
  });

  it('asks content for the unit of an attempt older than the snapshot', async () => {
    const old = attempt({ exercisePath: { course: 'C', module: 'M', exercise: null } });
    const { handler, getExercisePlacement } = makeHandler(
      [old],
      1,
      Result.ok({
        containerId: 'course-1',
        containerTitle: 'C',
        moduleId: 'module-7',
        moduleTitle: 'M',
        exerciseTitle: null,
        ownerSchoolId: null,
        ownerUserId: null,
      }),
    );

    const result = await handler.execute(new ListMyMistakesQuery(USER, null, 3));

    expect(getExercisePlacement).toHaveBeenCalledWith('ex-1');
    expect(result.items[0].unitId).toBe('module-7');
  });

  it('leaves the unit null when content cannot place the exercise', async () => {
    const { handler } = makeHandler([attempt({ exercisePath: null })], 1);

    const result = await handler.execute(new ListMyMistakesQuery(USER, null, 3));

    expect(result.items[0].unitId).toBeNull();
  });
});
