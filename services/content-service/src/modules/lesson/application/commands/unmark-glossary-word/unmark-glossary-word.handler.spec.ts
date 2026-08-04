import { UnmarkGlossaryWordHandler } from './unmark-glossary-word.handler.js';
import { UnmarkGlossaryWordCommand } from './unmark-glossary-word.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonGlossaryMarkRepository } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';

const OWNER_ID = 'owner-1';
const VOCAB_ID = 'vocab-1';
const VARIANT_ID = 'variant-1';

function makeLesson(kind: LessonKind = LessonKind.TEXT): LessonEntity {
  const result = LessonEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Yrker',
    ownerUserId: OWNER_ID,
    visibility: Visibility.PUBLIC,
    kind,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: { lesson?: LessonEntity | null } = {}) {
  const lesson = overrides.lesson === undefined ? makeLesson() : overrides.lesson;
  const variantResult = LessonContentVariantEntity.create({
    lessonId: lesson?.id ?? 'lesson-1',
    explanationLanguage: 'en',
    minLevel: DifficultyLevel.A1,
    maxLevel: DifficultyLevel.A2,
    displayTitle: 'Yrker — EN',
    bodyMarkdown: 'Sykepleieren jobber om natten.',
    createdByUserId: OWNER_ID,
  });
  if (variantResult.isFail) throw new Error('unexpected failure building test fixture');

  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(lesson),
    findContainingModuleIds: jest.fn().mockResolvedValue(['module-1']),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(variantResult.value),
  } as unknown as ILessonContentVariantRepository;

  const markRepo = {
    findByVariantId: jest.fn(),
    upsertMark: jest.fn(),
    deleteMark: jest.fn().mockResolvedValue(undefined),
  } as unknown as ILessonGlossaryMarkRepository;

  const spanRepo = {
    findByVariantId: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    deleteByVariantAndRef: jest.fn().mockResolvedValue(2),
  } as unknown as ILessonTextSpanRepository;

  return {
    handler: new UnmarkGlossaryWordHandler(lessonRepo, variantRepo, markRepo, spanRepo),
    lessonRepo,
    markRepo,
    spanRepo,
  };
}

describe('UnmarkGlossaryWordHandler', () => {
  it('removes the mark and cascades to that word’s spans in this variant', async () => {
    const { handler, markRepo, spanRepo } = makeHandler();

    const result = await handler.execute(
      new UnmarkGlossaryWordCommand(OWNER_ID, VARIANT_ID, VOCAB_ID),
    );

    expect(result.isOk).toBe(true);
    expect(spanRepo.deleteByVariantAndRef).toHaveBeenCalledWith(VARIANT_ID, VOCAB_ID);
    expect(markRepo.deleteMark).toHaveBeenCalledWith(VARIANT_ID, VOCAB_ID);
  });

  it('leaves the module glossary alone — another lesson may introduce the same word', async () => {
    const { handler, lessonRepo } = makeHandler();

    await handler.execute(new UnmarkGlossaryWordCommand(OWNER_ID, VARIANT_ID, VOCAB_ID));

    expect(lessonRepo.findContainingModuleIds).not.toHaveBeenCalled();
  });

  it('works on VIDEO variants, which also carry glossary marks', async () => {
    const { handler, markRepo } = makeHandler({ lesson: makeLesson(LessonKind.VIDEO) });

    const result = await handler.execute(
      new UnmarkGlossaryWordCommand(OWNER_ID, VARIANT_ID, VOCAB_ID),
    );

    expect(result.isOk).toBe(true);
    expect(markRepo.deleteMark).toHaveBeenCalled();
  });

  it('refuses an AUDIO lesson, which has no glossary', async () => {
    const { handler } = makeHandler({ lesson: makeLesson(LessonKind.AUDIO) });

    const result = await handler.execute(
      new UnmarkGlossaryWordCommand(OWNER_ID, VARIANT_ID, VOCAB_ID),
    );

    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
  });
});
