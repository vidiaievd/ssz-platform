import { SetParagraphTranslationsHandler } from './set-paragraph-translations.handler.js';
import { SetParagraphTranslationsCommand } from './set-paragraph-translations.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonParagraphTranslationRepository } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';

const OWNER_ID = 'owner-1';
const BODY_MARKDOWN = 'First paragraph.\n\nSecond paragraph.';

function makeLesson(kind: LessonKind): LessonEntity {
  const result = LessonEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Reading',
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
    displayTitle: 'Reading — EN',
    bodyMarkdown: BODY_MARKDOWN,
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

  const translationRepo = {
    findByVariantId: jest.fn(),
    replaceForVariant: jest.fn().mockResolvedValue(undefined),
  } as unknown as ILessonParagraphTranslationRepository;

  return {
    handler: new SetParagraphTranslationsHandler(lessonRepo, variantRepo, translationRepo),
    translationRepo,
  };
}

describe('SetParagraphTranslationsHandler', () => {
  it('replaces translations for a TEXT-kind lesson variant', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, translationRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetParagraphTranslationsCommand(OWNER_ID, variant.id, [
        { paragraphIndex: 0, translation: 'First.' },
        { paragraphIndex: 1, translation: 'Second.' },
      ]),
    );

    expect(result.isOk).toBe(true);
    expect(translationRepo.replaceForVariant).toHaveBeenCalledWith(variant.id, [
      { paragraphIndex: 0, translation: 'First.' },
      { paragraphIndex: 1, translation: 'Second.' },
    ]);
  });

  it('rejects when the variant belongs to a non-TEXT lesson', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler, translationRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetParagraphTranslationsCommand(OWNER_ID, variant.id, [
        { paragraphIndex: 0, translation: 'First.' },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(translationRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects a paragraphIndex out of range for the current body_markdown', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id); // only 2 paragraphs, indices 0-1
    const { handler, translationRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetParagraphTranslationsCommand(OWNER_ID, variant.id, [
        { paragraphIndex: 5, translation: 'Out of range.' },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INVALID_PARAGRAPH_INDEX);
    expect(translationRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, translationRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetParagraphTranslationsCommand('someone-else', variant.id, [
        { paragraphIndex: 0, translation: 'First.' },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    expect(translationRepo.replaceForVariant).not.toHaveBeenCalled();
  });
});
