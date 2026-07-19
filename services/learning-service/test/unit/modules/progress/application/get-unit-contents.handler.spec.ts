import { jest } from '@jest/globals';
import { GetUnitContentsHandler } from '../../../../../src/modules/progress/application/queries/get-unit-contents.handler.js';
import { GetUnitContentsQuery } from '../../../../../src/modules/progress/application/queries/get-unit-contents.query.js';
import type { IProgressRepository } from '../../../../../src/modules/progress/domain/repositories/progress.repository.interface.js';
import type {
  IContentClient,
  ModuleReaderStructureRef,
} from '../../../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';
import { ContentRef } from '../../../../../src/shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { UserProgress } from '../../../../../src/modules/progress/domain/entities/user-progress.entity.js';

const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const MODULE_ID = 'e6b1e9f0-1234-4a12-9abc-0987654321ab';
const SECTION_ID = 'section-1';
const LESSON_ID = '11111111-1111-4111-8111-111111111111';
const VOCAB_ID = '22222222-2222-4222-8222-222222222222';
const EXERCISE_ID = '33333333-3333-4333-8333-333333333333';

function makeStructure(): ModuleReaderStructureRef {
  return {
    moduleId: MODULE_ID,
    moduleTitle: 'Leksjon 17',
    sections: [
      {
        id: SECTION_ID,
        title: 'Reading',
        position: 0,
        items: [
          {
            id: 'item-lesson',
            ref: ContentRef.fromPersistence('LESSON', LESSON_ID),
            title: 'Å bo i Norge',
            position: 0,
            lessonKind: 'text',
            durationMinutes: 6,
            xpReward: 10,
          },
          {
            id: 'item-vocab',
            ref: ContentRef.fromPersistence('VOCABULARY_LIST', VOCAB_ID),
            title: 'Bolig-ord',
            position: 1,
            lessonKind: null,
            durationMinutes: null,
            xpReward: null,
          },
        ],
      },
    ],
    ungroupedItems: [
      {
        id: 'item-exercise',
        ref: ContentRef.fromPersistence('EXERCISE', EXERCISE_ID),
        title: 'Quiz',
        position: 2,
        lessonKind: null,
        durationMinutes: null,
        xpReward: null,
      },
    ],
  };
}

function makeHandler(overrides: Partial<{
  progressRows: UserProgress[];
  structure: ModuleReaderStructureRef;
}> = {}) {
  const progressRepo = {
    findByUserAndContentIds: jest.fn<() => Promise<UserProgress[]>>()
      .mockResolvedValue(overrides.progressRows ?? []),
  } as unknown as IProgressRepository;

  const contentClient = {
    getModuleReaderStructure: jest.fn<() => Promise<Result<ModuleReaderStructureRef, ContentClientError>>>()
      .mockResolvedValue(Result.ok(overrides.structure ?? makeStructure())),
  } as unknown as IContentClient;

  return { handler: new GetUnitContentsHandler(progressRepo, contentClient), progressRepo, contentClient };
}

describe('GetUnitContentsHandler', () => {
  it('marks every item available when nothing is completed (no within-module lock)', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(new GetUnitContentsQuery(USER_ID, MODULE_ID));

    expect(result.sections[0].items.map((i) => i.status)).toEqual(['available', 'available']);
    expect(result.ungroupedItems[0].status).toBe('available');
    expect(result.sections[0].items[0].xpReward).toBe(10);
    expect(result.sections[0].items[1].xpReward).toBeNull();
  });

  it('marks a completed item as completed while the rest stay available', async () => {
    const completedLesson = UserProgress.reconstitute({
      id: 'p1',
      userId: USER_ID,
      contentType: 'LESSON',
      contentId: LESSON_ID,
      status: 'COMPLETED',
      attemptsCount: 1,
      lastAttemptAt: new Date(),
      timeSpentSeconds: 60,
      score: null,
      completedAt: new Date(),
      needsReviewSince: null,
      reviewResolvedAt: null,
    });

    const { handler } = makeHandler({ progressRows: [completedLesson] });

    const result = await handler.execute(new GetUnitContentsQuery(USER_ID, MODULE_ID));

    expect(result.sections[0].items.map((i) => i.status)).toEqual(['completed', 'available']);
    expect(result.ungroupedItems[0].status).toBe('available');
  });

  it('surfaces IN_PROGRESS as in_progress', async () => {
    const inProgress = UserProgress.reconstitute({
      id: 'p1',
      userId: USER_ID,
      contentType: 'LESSON',
      contentId: LESSON_ID,
      status: 'IN_PROGRESS',
      attemptsCount: 1,
      lastAttemptAt: new Date(),
      timeSpentSeconds: 60,
      score: null,
      completedAt: null,
      needsReviewSince: null,
      reviewResolvedAt: null,
    });

    const { handler } = makeHandler({ progressRows: [inProgress] });

    const result = await handler.execute(new GetUnitContentsQuery(USER_ID, MODULE_ID));

    expect(result.sections[0].items[0].status).toBe('in_progress');
    expect(result.sections[0].items[1].status).toBe('available');
  });

  it('throws BadRequestException when the content client fails', async () => {
    const { handler, contentClient } = makeHandler();
    (contentClient.getModuleReaderStructure as jest.Mock).mockResolvedValue(
      Result.fail(new ContentClientError('module not found', 404)),
    );

    await expect(handler.execute(new GetUnitContentsQuery(USER_ID, MODULE_ID))).rejects.toThrow(
      'Cannot fetch unit structure',
    );
  });
});
