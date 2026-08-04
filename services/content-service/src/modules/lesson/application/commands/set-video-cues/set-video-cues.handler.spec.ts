import { SetVideoCuesHandler } from './set-video-cues.handler.js';
import { SetVideoCuesCommand } from './set-video-cues.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
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
}) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(overrides.variant ?? null),
  } as unknown as ILessonContentVariantRepository;

  const cueRepo = {
    findByVariantId: jest.fn(),
    replaceForVariant: jest.fn().mockResolvedValue(undefined),
  } as unknown as ILessonVideoCueRepository;

  return { handler: new SetVideoCuesHandler(lessonRepo, variantRepo, cueRepo), cueRepo };
}

describe('SetVideoCuesHandler', () => {
  it('replaces cues for a VIDEO-kind lesson variant', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetVideoCuesCommand(OWNER_ID, variant.id, [
        { position: 0, startSeconds: 0, targetLine: 'Hei!', translationLine: 'Hi!' },
        { position: 1, startSeconds: 3.5, targetLine: 'Hvordan har du det?' },
      ]),
    );

    expect(result.isOk).toBe(true);
    expect(cueRepo.replaceForVariant).toHaveBeenCalledTimes(1);
    expect(cueRepo.replaceForVariant).toHaveBeenCalledWith(
      variant.id,
      expect.arrayContaining([
        expect.objectContaining({ position: 0, targetLine: 'Hei!' }),
        expect.objectContaining({ position: 1, targetLine: 'Hvordan har du det?' }),
      ]),
    );
  });

  it('replaces with an empty list, clearing all cues', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(new SetVideoCuesCommand(OWNER_ID, variant.id, []));

    expect(result.isOk).toBe(true);
    expect(cueRepo.replaceForVariant).toHaveBeenCalledWith(variant.id, []);
  });

  it('rejects when the variant belongs to a non-VIDEO lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetVideoCuesCommand(OWNER_ID, variant.id, [
        { position: 0, startSeconds: 0, targetLine: 'Hei!' },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(cueRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects duplicate positions within the same request', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetVideoCuesCommand(OWNER_ID, variant.id, [
        { position: 0, startSeconds: 0, targetLine: 'Hei!' },
        { position: 0, startSeconds: 5, targetLine: 'Duplicate!' },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.DUPLICATE_CUE_POSITION);
    expect(cueRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects invalid cue data (blank target line)', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, cueRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetVideoCuesCommand(OWNER_ID, variant.id, [
        { position: 0, startSeconds: 0, targetLine: '   ' },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INVALID_CUE_DATA);
    expect(cueRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the variant does not exist', async () => {
    const { handler, cueRepo } = makeHandler({ variant: null });

    const result = await handler.execute(new SetVideoCuesCommand(OWNER_ID, 'missing-variant', []));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.VARIANT_NOT_FOUND);
    expect(cueRepo.replaceForVariant).not.toHaveBeenCalled();
  });
});
