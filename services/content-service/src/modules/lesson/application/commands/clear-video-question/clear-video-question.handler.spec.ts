import { ClearVideoQuestionHandler } from './clear-video-question.handler.js';
import { ClearVideoQuestionCommand } from './clear-video-question.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonVideoQuestionRepository } from '../../../domain/repositories/lesson-video-question.repository.interface.js';

const OWNER_ID = 'owner-1';

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
}) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(overrides.variant ?? null),
  } as unknown as ILessonContentVariantRepository;

  const questionRepo = {
    findByVariantId: jest.fn(),
    upsertForVariant: jest.fn(),
    deleteForVariant: jest.fn().mockResolvedValue(undefined),
  } as unknown as ILessonVideoQuestionRepository;

  return {
    handler: new ClearVideoQuestionHandler(lessonRepo, variantRepo, questionRepo),
    questionRepo,
  };
}

describe('ClearVideoQuestionHandler', () => {
  it('clears the comprehension link for a VIDEO-kind lesson variant', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, questionRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(new ClearVideoQuestionCommand(OWNER_ID, variant.id));

    expect(result.isOk).toBe(true);
    expect(questionRepo.deleteForVariant).toHaveBeenCalledWith(variant.id);
  });

  it('rejects when the variant belongs to a non-VIDEO lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, questionRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(new ClearVideoQuestionCommand(OWNER_ID, variant.id));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(questionRepo.deleteForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the variant does not exist', async () => {
    const { handler, questionRepo } = makeHandler({ variant: null });

    const result = await handler.execute(
      new ClearVideoQuestionCommand(OWNER_ID, 'missing-variant'),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.VARIANT_NOT_FOUND);
    expect(questionRepo.deleteForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the lesson', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, questionRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(new ClearVideoQuestionCommand('someone-else', variant.id));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    expect(questionRepo.deleteForVariant).not.toHaveBeenCalled();
  });
});
