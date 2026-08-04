import { CreateTextSpanHandler } from './create-text-span.handler.js';
import { CreateTextSpanCommand } from './create-text-span.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';
import { LessonTextSpanEntity } from '../../../domain/entities/lesson-text-span.entity.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import type { ILessonGlossaryMarkRepository } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../../grammar-rule/domain/repositories/grammar-rule.repository.interface.js';
import type { IContentRelationRepository } from '../../../../content-relation/domain/repositories/content-relation.repository.interface.js';

const OWNER_ID = 'owner-1';
const VOCAB_ID = 'vocab-1';
const VARIANT_ID = 'variant-1';

// Paragraph 0: offsets 0–12 are "Sykepleieren".
const BODY = 'Sykepleieren jobber om natten.\n\nHun liker jobben sin.';

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

function makeVariant(lessonId: string): LessonContentVariantEntity {
  const result = LessonContentVariantEntity.create({
    lessonId,
    explanationLanguage: 'en',
    minLevel: DifficultyLevel.A1,
    maxLevel: DifficultyLevel.A2,
    displayTitle: 'Yrker — EN',
    bodyMarkdown: BODY,
    createdByUserId: OWNER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(
  overrides: {
    lesson?: LessonEntity | null;
    variant?: LessonContentVariantEntity | null;
    vocabularyItem?: { deletedAt: Date | null } | null;
    grammarRule?: { deletedAt: Date | null } | null;
    existingSpans?: LessonTextSpanEntity[];
    moduleIds?: string[];
  } = {},
) {
  const lesson = overrides.lesson === undefined ? makeLesson() : overrides.lesson;
  const variant =
    overrides.variant === undefined ? makeVariant(lesson?.id ?? 'lesson-1') : overrides.variant;

  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(lesson),
    findContainingModuleIds: jest.fn().mockResolvedValue(overrides.moduleIds ?? []),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(variant),
  } as unknown as ILessonContentVariantRepository;

  const spanRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.existingSpans ?? []),
    findById: jest.fn(),
    save: jest.fn().mockImplementation((span: LessonTextSpanEntity) => Promise.resolve(span)),
    delete: jest.fn(),
    deleteByVariantAndRef: jest.fn(),
  } as unknown as ILessonTextSpanRepository;

  const markRepo = {
    findByVariantId: jest.fn(),
    upsertMark: jest
      .fn()
      .mockResolvedValue({ id: 'mark-1', vocabularyItemId: VOCAB_ID, occurrenceCount: 1 }),
    deleteMark: jest.fn(),
  } as unknown as ILessonGlossaryMarkRepository;

  const vocabularyItemRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.vocabularyItem === undefined ? { deletedAt: null } : overrides.vocabularyItem,
      ),
  } as unknown as IVocabularyItemRepository;

  const grammarRuleRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.grammarRule === undefined ? { deletedAt: null } : overrides.grammarRule,
      ),
  } as unknown as IGrammarRuleRepository;

  const contentRelationRepo = {
    findExact: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  } as unknown as IContentRelationRepository;

  const handler = new CreateTextSpanHandler(
    lessonRepo,
    variantRepo,
    spanRepo,
    markRepo,
    vocabularyItemRepo,
    grammarRuleRepo,
    contentRelationRepo,
  );

  return { handler, lessonRepo, variantRepo, spanRepo, markRepo, contentRelationRepo, lesson };
}

function command(
  overrides: Partial<{
    paragraphIndex: number;
    charStart: number;
    charEnd: number;
    kind: LessonSpanKind;
    refId: string | null;
    userId: string;
  }> = {},
) {
  return new CreateTextSpanCommand(
    overrides.userId ?? OWNER_ID,
    VARIANT_ID,
    overrides.paragraphIndex ?? 0,
    overrides.charStart ?? 0,
    overrides.charEnd ?? 12,
    overrides.kind ?? LessonSpanKind.VOCAB,
    overrides.refId === undefined ? VOCAB_ID : overrides.refId,
    null,
  );
}

describe('CreateTextSpanHandler', () => {
  it('derives the snapshot from the current body rather than trusting the caller', async () => {
    const { handler, spanRepo } = makeHandler();

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(result.value.span.textSnapshot).toBe('Sykepleieren');
    expect(spanRepo.save).toHaveBeenCalledTimes(1);
  });

  it('anchors against the paragraph split, not the raw body', async () => {
    const { handler } = makeHandler();

    // Paragraph 1 starts fresh at offset 0 — "Hun liker".
    const result = await handler.execute(command({ paragraphIndex: 1, charStart: 4, charEnd: 9 }));

    expect(result.value.span.textSnapshot).toBe('liker');
  });

  it('rejects a range that runs past the end of the paragraph', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(command({ charStart: 0, charEnd: 400 }));

    expect(result.error).toBe(LessonDomainError.SPAN_RANGE_INVALID);
  });

  it('rejects a paragraph index the body does not have', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(command({ paragraphIndex: 7 }));

    expect(result.error).toBe(LessonDomainError.INVALID_PARAGRAPH_INDEX);
  });

  it('rejects an overlap with a span of the same kind', async () => {
    const existing = LessonTextSpanEntity.create({
      lessonContentVariantId: VARIANT_ID,
      paragraphIndex: 0,
      charStart: 6,
      charEnd: 20,
      kind: LessonSpanKind.VOCAB,
      refId: 'vocab-2',
      textSnapshot: 'eieren jobber',
      createdByUserId: OWNER_ID,
    }).value;
    const { handler } = makeHandler({ existingSpans: [existing] });

    const result = await handler.execute(command());

    expect(result.error).toBe(LessonDomainError.SPAN_OVERLAP);
  });

  it('allows a vocab span nested inside a chunk of the same range', async () => {
    const chunk = LessonTextSpanEntity.create({
      lessonContentVariantId: VARIANT_ID,
      paragraphIndex: 0,
      charStart: 0,
      charEnd: 12,
      kind: LessonSpanKind.CHUNK,
      refId: null,
      textSnapshot: 'Sykepleieren',
      createdByUserId: OWNER_ID,
    }).value;
    const { handler } = makeHandler({ existingSpans: [chunk] });

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
  });

  it('marks the word in the glossary and syncs every containing module', async () => {
    const { handler, markRepo, contentRelationRepo } = makeHandler({
      moduleIds: ['module-1', 'module-2'],
    });

    await handler.execute(command());

    expect(markRepo.upsertMark).toHaveBeenCalledWith(VARIANT_ID, VOCAB_ID);
    expect(contentRelationRepo.save).toHaveBeenCalledTimes(2);
  });

  it('does not touch the glossary for grammar and chunk spans', async () => {
    const { handler, markRepo } = makeHandler({ moduleIds: ['module-1'] });

    await handler.execute(command({ kind: LessonSpanKind.GRAMMAR, refId: 'rule-1' }));
    await handler.execute(command({ kind: LessonSpanKind.CHUNK, refId: null }));

    expect(markRepo.upsertMark).not.toHaveBeenCalled();
  });

  it('rejects a referent that does not exist or was soft-deleted', async () => {
    const missingVocab = await makeHandler({ vocabularyItem: null }).handler.execute(command());
    expect(missingVocab.error).toBe(LessonDomainError.VOCABULARY_ITEM_NOT_FOUND);

    const deletedVocab = await makeHandler({
      vocabularyItem: { deletedAt: new Date() },
    }).handler.execute(command());
    expect(deletedVocab.error).toBe(LessonDomainError.VOCABULARY_ITEM_NOT_FOUND);

    const missingRule = await makeHandler({ grammarRule: null }).handler.execute(
      command({ kind: LessonSpanKind.GRAMMAR, refId: 'rule-1' }),
    );
    expect(missingRule.error).toBe(LessonDomainError.GRAMMAR_RULE_NOT_FOUND);
  });

  it('refuses a non-TEXT lesson — spans are anchored to paragraph offsets', async () => {
    const lesson = makeLesson(LessonKind.VIDEO);
    const { handler } = makeHandler({ lesson, variant: makeVariant(lesson.id) });

    const result = await handler.execute(command());

    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
  });

  it('404s on a missing variant before doing anything else', async () => {
    const { handler, spanRepo } = makeHandler({ variant: null });

    const result = await handler.execute(command());

    expect(result.error).toBe(LessonDomainError.VARIANT_NOT_FOUND);
    expect(spanRepo.save).not.toHaveBeenCalled();
  });
});
