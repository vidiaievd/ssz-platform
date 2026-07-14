import { CreateListeningStageHandler } from './create-listening-stage.handler.js';
import { CreateListeningStageCommand } from './create-listening-stage.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonListeningStageEntity } from '../../../domain/entities/lesson-listening-stage.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonListeningStageRepository } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';

const OWNER_ID = 'owner-1';
const EXERCISE_ID = 'exercise-1';

function makeLesson(kind: LessonKind): LessonEntity {
  const result = LessonEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Listening practice',
    ownerUserId: OWNER_ID,
    visibility: Visibility.PUBLIC,
    kind,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeVariant(lessonId: string): LessonContentVariantEntity {
  const result = LessonContentVariantEntity.create({
    lessonId,
    explanationLanguage: 'en',
    minLevel: DifficultyLevel.A1,
    maxLevel: DifficultyLevel.A2,
    displayTitle: 'Listening — EN',
    bodyMarkdown: 'audio lesson body',
    createdByUserId: OWNER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  lesson?: LessonEntity | null;
  variant?: LessonContentVariantEntity | null;
  existingStage?: LessonListeningStageEntity | null;
  exercise?: { deletedAt: Date | null } | null;
}) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(overrides.variant ?? null),
  } as unknown as ILessonContentVariantRepository;

  const stageRepo = {
    findByVariantAndPosition: jest.fn().mockResolvedValue(overrides.existingStage ?? null),
    save: jest.fn().mockImplementation((e: LessonListeningStageEntity) => Promise.resolve(e)),
    findByVariantId: jest.fn(),
  } as unknown as ILessonListeningStageRepository;

  const exerciseRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.exercise === undefined ? { deletedAt: null } : overrides.exercise,
      ),
  } as unknown as IExerciseRepository;

  return {
    handler: new CreateListeningStageHandler(lessonRepo, variantRepo, stageRepo, exerciseRepo),
    stageRepo,
  };
}

describe('CreateListeningStageHandler', () => {
  it('stages a gap-fill exercise for an AUDIO-kind lesson variant', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new CreateListeningStageCommand(
        OWNER_ID,
        variant.id,
        EXERCISE_ID,
        0,
        ListeningStageType.GAP_FILL,
      ),
    );

    expect(result.isOk).toBe(true);
    expect(stageRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects when the variant belongs to a non-AUDIO lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new CreateListeningStageCommand(
        OWNER_ID,
        variant.id,
        EXERCISE_ID,
        0,
        ListeningStageType.GAP_FILL,
      ),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(stageRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the exercise does not exist', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant, exercise: null });

    const result = await handler.execute(
      new CreateListeningStageCommand(
        OWNER_ID,
        variant.id,
        'missing-exercise',
        0,
        ListeningStageType.COMPREHENSION,
      ),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.EXERCISE_NOT_FOUND);
    expect(stageRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the exercise is soft-deleted', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({
      lesson,
      variant,
      exercise: { deletedAt: new Date() },
    });

    const result = await handler.execute(
      new CreateListeningStageCommand(
        OWNER_ID,
        variant.id,
        EXERCISE_ID,
        0,
        ListeningStageType.GAP_FILL,
      ),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.EXERCISE_NOT_FOUND);
    expect(stageRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate position for the same variant', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const existingStageResult = LessonListeningStageEntity.create({
      lessonContentVariantId: variant.id,
      exerciseId: EXERCISE_ID,
      position: 0,
      stageType: ListeningStageType.GAP_FILL,
    });
    if (existingStageResult.isFail) throw new Error('unexpected failure building test fixture');

    const { handler, stageRepo } = makeHandler({
      lesson,
      variant,
      existingStage: existingStageResult.value,
    });

    const result = await handler.execute(
      new CreateListeningStageCommand(
        OWNER_ID,
        variant.id,
        EXERCISE_ID,
        0,
        ListeningStageType.COMPREHENSION,
      ),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.DUPLICATE_STAGE_POSITION);
    expect(stageRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the lesson', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new CreateListeningStageCommand(
        'someone-else',
        variant.id,
        EXERCISE_ID,
        0,
        ListeningStageType.GAP_FILL,
      ),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    expect(stageRepo.save).not.toHaveBeenCalled();
  });
});
