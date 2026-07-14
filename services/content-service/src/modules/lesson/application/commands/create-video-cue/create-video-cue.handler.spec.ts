import { CreateVideoCueHandler } from './create-video-cue.handler.js';
import { CreateVideoCueCommand } from './create-video-cue.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonVideoCueEntity } from '../../../domain/entities/lesson-video-cue.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonVideoCueRepository } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';

const OWNER_ID = 'owner-1';

function makeLesson(kind: LessonKind): LessonEntity {
  const result = LessonEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Greetings',
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
    displayTitle: 'Greetings — EN',
    bodyMarkdown: 'video lesson body',
    createdByUserId: OWNER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  lesson?: LessonEntity | null;
  variant?: LessonContentVariantEntity | null;
  existingCue?: LessonVideoCueEntity | null;
}) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(overrides.variant ?? null),
  } as unknown as ILessonContentVariantRepository;

  const cueRepo = {
    findByVariantAndPosition: jest.fn().mockResolvedValue(overrides.existingCue ?? null),
    save: jest.fn().mockImplementation((e: LessonVideoCueEntity) => Promise.resolve(e)),
    findByVariantId: jest.fn(),
  } as unknown as ILessonVideoCueRepository;

  return { handler: new CreateVideoCueHandler(lessonRepo, variantRepo, cueRepo), cueRepo };
}

describe('CreateVideoCueHandler', () => {
  it('creates a cue for a VIDEO-kind lesson variant', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new CreateVideoCueCommand(OWNER_ID, variant.id, 0, 12.5, 'Hei!', 'Hi!'),
    );

    expect(result.isOk).toBe(true);
    expect(cueRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects when the variant belongs to a non-VIDEO lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new CreateVideoCueCommand(OWNER_ID, variant.id, 0, 12.5, 'Hei!'),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(cueRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate position for the same variant', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const existingCueResult = LessonVideoCueEntity.create({
      lessonContentVariantId: variant.id,
      position: 0,
      startSeconds: 0,
      targetLine: 'Hei!',
    });
    if (existingCueResult.isFail) throw new Error('unexpected failure building test fixture');

    const { handler, cueRepo } = makeHandler({
      lesson,
      variant,
      existingCue: existingCueResult.value,
    });

    const result = await handler.execute(
      new CreateVideoCueCommand(OWNER_ID, variant.id, 0, 5, 'Duplicate!'),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.DUPLICATE_CUE_POSITION);
    expect(cueRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the variant does not exist', async () => {
    const { handler, cueRepo } = makeHandler({ variant: null });

    const result = await handler.execute(
      new CreateVideoCueCommand(OWNER_ID, 'missing-variant', 0, 0, 'Hei!'),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.VARIANT_NOT_FOUND);
    expect(cueRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the lesson', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new CreateVideoCueCommand('someone-else', variant.id, 0, 0, 'Hei!'),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    expect(cueRepo.save).not.toHaveBeenCalled();
  });
});
