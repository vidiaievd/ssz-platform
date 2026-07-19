import { jest } from '@jest/globals';
import { GetCourseProgressOverlayHandler } from '../../../../../src/modules/progress/application/queries/get-course-progress-overlay.handler.js';
import { GetCourseProgressOverlayQuery } from '../../../../../src/modules/progress/application/queries/get-course-progress-overlay.query.js';
import type { IProgressRepository } from '../../../../../src/modules/progress/domain/repositories/progress.repository.interface.js';
import type {
  CourseLeafItemRef,
  IContentClient,
} from '../../../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';
import { ContentRef } from '../../../../../src/shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { UserProgress } from '../../../../../src/modules/progress/domain/entities/user-progress.entity.js';

const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const COURSE_ID = 'e6b1e9f0-1234-4a12-9abc-0987654321ab';
const MODULE_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const MODULE_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const LESSON_ID = '11111111-1111-4111-8111-111111111111';
const EXERCISE_ID = '22222222-2222-4222-8222-222222222222';
const VOCAB_ID = '33333333-3333-4333-8333-333333333333';

function makeLeafItems(): CourseLeafItemRef[] {
  return [
    { ref: ContentRef.fromPersistence('LESSON', LESSON_ID), moduleId: MODULE_A, isRequired: true },
    { ref: ContentRef.fromPersistence('EXERCISE', EXERCISE_ID), moduleId: MODULE_A, isRequired: false },
    { ref: ContentRef.fromPersistence('VOCABULARY_LIST', VOCAB_ID), moduleId: MODULE_B, isRequired: true },
  ];
}

function makeHandler(overrides: Partial<{ progressRows: UserProgress[]; leaf: CourseLeafItemRef[] }> = {}) {
  const progressRepo = {
    findByUserAndContentIds: jest.fn<() => Promise<UserProgress[]>>()
      .mockResolvedValue(overrides.progressRows ?? []),
  } as unknown as IProgressRepository;

  const contentClient = {
    getCourseLeafItems: jest.fn<() => Promise<Result<CourseLeafItemRef[], ContentClientError>>>()
      .mockResolvedValue(Result.ok(overrides.leaf ?? makeLeafItems())),
  } as unknown as IContentClient;

  return { handler: new GetCourseProgressOverlayHandler(progressRepo, contentClient), contentClient };
}

describe('GetCourseProgressOverlayHandler', () => {
  it('carries moduleId and isRequired through to each item entry', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(new GetCourseProgressOverlayQuery(USER_ID, COURSE_ID));

    expect(result.items).toEqual([
      expect.objectContaining({ contentId: LESSON_ID, moduleId: MODULE_A, isRequired: true, status: 'NOT_STARTED' }),
      expect.objectContaining({ contentId: EXERCISE_ID, moduleId: MODULE_A, isRequired: false }),
      expect.objectContaining({ contentId: VOCAB_ID, moduleId: MODULE_B, isRequired: true }),
    ]);
    expect(result.totalItems).toBe(3);
    expect(result.completedItems).toBe(0);
  });

  it('reflects COMPLETED progress in status and counts', async () => {
    const completed = UserProgress.reconstitute({
      id: 'p1',
      userId: USER_ID,
      contentType: 'LESSON',
      contentId: LESSON_ID,
      status: 'COMPLETED',
      attemptsCount: 1,
      lastAttemptAt: new Date(),
      timeSpentSeconds: 60,
      score: 90,
      completedAt: new Date(),
      needsReviewSince: null,
      reviewResolvedAt: null,
    });

    const { handler } = makeHandler({ progressRows: [completed] });

    const result = await handler.execute(new GetCourseProgressOverlayQuery(USER_ID, COURSE_ID));

    const lesson = result.items.find((i) => i.contentId === LESSON_ID);
    expect(lesson?.status).toBe('COMPLETED');
    expect(lesson?.score).toBe(90);
    expect(result.completedItems).toBe(1);
    expect(result.completionRatio).toBeCloseTo(1 / 3);
  });

  it('throws when the content client fails', async () => {
    const { handler, contentClient } = makeHandler();
    (contentClient.getCourseLeafItems as jest.Mock).mockResolvedValue(
      Result.fail(new ContentClientError('course not found', 404)),
    );

    await expect(
      handler.execute(new GetCourseProgressOverlayQuery(USER_ID, COURSE_ID)),
    ).rejects.toThrow('Cannot fetch course structure');
  });
});
