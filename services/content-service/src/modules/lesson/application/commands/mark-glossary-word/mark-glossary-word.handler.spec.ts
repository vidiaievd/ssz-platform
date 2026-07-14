import { MarkGlossaryWordHandler } from './mark-glossary-word.handler.js';
import { MarkGlossaryWordCommand } from './mark-glossary-word.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonGlossaryMarkRepository } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import type { IContentRelationRepository } from '../../../../content-relation/domain/repositories/content-relation.repository.interface.js';

const OWNER_ID = 'owner-1';
const VOCAB_ID = 'vocab-1';

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
    bodyMarkdown: 'Hei, hvordan har du det?',
    createdByUserId: OWNER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  lesson?: LessonEntity | null;
  variant?: LessonContentVariantEntity | null;
  vocabularyItem?: { deletedAt: Date | null } | null;
  moduleIds?: string[];
  existingRelation?: unknown;
}) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
    findContainingModuleIds: jest.fn().mockResolvedValue(overrides.moduleIds ?? []),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(overrides.variant ?? null),
  } as unknown as ILessonContentVariantRepository;

  const markRepo = {
    upsertMark: jest
      .fn()
      .mockResolvedValue({ id: 'mark-1', vocabularyItemId: VOCAB_ID, occurrenceCount: 1 }),
    findByVariantId: jest.fn(),
  } as unknown as ILessonGlossaryMarkRepository;

  const vocabularyItemRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.vocabularyItem === undefined ? { deletedAt: null } : overrides.vocabularyItem,
      ),
  } as unknown as IVocabularyItemRepository;

  const contentRelationRepo = {
    findExact: jest.fn().mockResolvedValue(overrides.existingRelation ?? null),
    save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  } as unknown as IContentRelationRepository;

  return {
    handler: new MarkGlossaryWordHandler(
      lessonRepo,
      variantRepo,
      markRepo,
      vocabularyItemRepo,
      contentRelationRepo,
    ),
    markRepo,
    contentRelationRepo,
  };
}

describe('MarkGlossaryWordHandler', () => {
  it('marks a word for a TEXT lesson and syncs ContentRelation for every containing module', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, markRepo, contentRelationRepo } = makeHandler({
      lesson,
      variant,
      moduleIds: ['module-1', 'module-2'],
    });

    const result = await handler.execute(
      new MarkGlossaryWordCommand(OWNER_ID, variant.id, VOCAB_ID),
    );

    expect(result.isOk).toBe(true);
    expect(markRepo.upsertMark).toHaveBeenCalledWith(variant.id, VOCAB_ID);
    expect(contentRelationRepo.save).toHaveBeenCalledTimes(2);
  });

  it('marks a word for a VIDEO lesson too', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const variant = makeVariant(lesson.id);
    const { handler } = makeHandler({ lesson, variant, moduleIds: [] });

    const result = await handler.execute(
      new MarkGlossaryWordCommand(OWNER_ID, variant.id, VOCAB_ID),
    );

    expect(result.isOk).toBe(true);
  });

  it('rejects for AUDIO/LIVE lessons', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, markRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new MarkGlossaryWordCommand(OWNER_ID, variant.id, VOCAB_ID),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(markRepo.upsertMark).not.toHaveBeenCalled();
  });

  it('rejects when the vocabulary item does not exist', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, markRepo } = makeHandler({ lesson, variant, vocabularyItem: null });

    const result = await handler.execute(
      new MarkGlossaryWordCommand(OWNER_ID, variant.id, 'missing-vocab'),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.VOCABULARY_ITEM_NOT_FOUND);
    expect(markRepo.upsertMark).not.toHaveBeenCalled();
  });

  it('does not create a duplicate ContentRelation when one already exists for a module', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, contentRelationRepo } = makeHandler({
      lesson,
      variant,
      moduleIds: ['module-1'],
      existingRelation: { id: 'relation-1' },
    });

    const result = await handler.execute(
      new MarkGlossaryWordCommand(OWNER_ID, variant.id, VOCAB_ID),
    );

    expect(result.isOk).toBe(true);
    expect(contentRelationRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, markRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new MarkGlossaryWordCommand('someone-else', variant.id, VOCAB_ID),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    expect(markRepo.upsertMark).not.toHaveBeenCalled();
  });
});
