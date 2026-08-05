import { SetVideoQuestionHandler } from './set-video-question.handler.js';
import { SetVideoQuestionCommand } from './set-video-question.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonVideoQuestionEntity } from '../../../domain/entities/lesson-video-question.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonVideoQuestionRepository } from '../../../domain/repositories/lesson-video-question.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';

const OWNER_ID = 'owner-1';
const EXERCISE_ID = 'exercise-1';

function makeLesson(kind: LessonKind): LessonEntity {
  const result = LessonEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Video lesson',
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
    displayTitle: 'Video — EN',
    bodyMarkdown: 'video lesson body',
    createdByUserId: OWNER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  lesson?: LessonEntity | null;
  variant?: LessonContentVariantEntity | null;
  existingQuestion?: LessonVideoQuestionEntity | null;
  exercise?: { deletedAt: Date | null } | null;
}) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(overrides.variant ?? null),
  } as unknown as ILessonContentVariantRepository;

  const questionRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.existingQuestion ?? null),
    upsertForVariant: jest
      .fn()
      .mockImplementation((e: LessonVideoQuestionEntity) => Promise.resolve(e)),
    deleteForVariant: jest.fn(),
  } as unknown as ILessonVideoQuestionRepository;

  const exerciseRepo = {
    findById: jest
      .fn()
      .mockResolvedValue('exercise' in overrides ? overrides.exercise : { deletedAt: null }),
  } as unknown as IExerciseRepository;

  return {
    handler: new SetVideoQuestionHandler(lessonRepo, variantRepo, questionRepo, exerciseRepo),
    questionRepo,
    exerciseRepo,
  };
}

describe('SetVideoQuestionHandler', () => {
  it('links a comprehension exercise for a VIDEO-kind lesson variant', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, questionRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetVideoQuestionCommand(OWNER_ID, variant.id, EXERCISE_ID),
    );

    expect(result.isOk).toBe(true);
    expect(questionRepo.upsertForVariant).toHaveBeenCalledTimes(1);
  });

  it('replaces an existing link for the same variant', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const existing = LessonVideoQuestionEntity.create({
      lessonContentVariantId: variant.id,
      exerciseId: 'old-exercise',
    });
    const { handler, questionRepo } = makeHandler({ lesson, variant, existingQuestion: existing });

    const result = await handler.execute(
      new SetVideoQuestionCommand(OWNER_ID, variant.id, EXERCISE_ID),
    );

    expect(result.isOk).toBe(true);
    const savedEntity = (questionRepo.upsertForVariant as jest.Mock).mock
      .calls[0][0] as LessonVideoQuestionEntity;
    expect(savedEntity.id).toBe(existing.id);
    expect(savedEntity.exerciseId).toBe(EXERCISE_ID);
  });

  it('rejects when the variant belongs to a non-VIDEO lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, questionRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetVideoQuestionCommand(OWNER_ID, variant.id, EXERCISE_ID),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(questionRepo.upsertForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the exercise does not exist', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, questionRepo } = makeHandler({ lesson, variant, exercise: null });

    const result = await handler.execute(
      new SetVideoQuestionCommand(OWNER_ID, variant.id, EXERCISE_ID),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.EXERCISE_NOT_FOUND);
    expect(questionRepo.upsertForVariant).not.toHaveBeenCalled();
  });

  it('rejects a soft-deleted exercise', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, questionRepo } = makeHandler({
      lesson,
      variant,
      exercise: { deletedAt: new Date() },
    });

    const result = await handler.execute(
      new SetVideoQuestionCommand(OWNER_ID, variant.id, EXERCISE_ID),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.EXERCISE_NOT_FOUND);
    expect(questionRepo.upsertForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the variant does not exist', async () => {
    const { handler, questionRepo } = makeHandler({ variant: null });

    const result = await handler.execute(
      new SetVideoQuestionCommand(OWNER_ID, 'missing-variant', EXERCISE_ID),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.VARIANT_NOT_FOUND);
    expect(questionRepo.upsertForVariant).not.toHaveBeenCalled();
  });
});
