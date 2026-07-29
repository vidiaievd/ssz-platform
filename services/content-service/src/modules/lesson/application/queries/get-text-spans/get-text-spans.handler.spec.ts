import { GetTextSpansHandler } from './get-text-spans.handler.js';
import { GetTextSpansQuery } from './get-text-spans.query.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';
import { LessonTextSpanEntity } from '../../../domain/entities/lesson-text-span.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../../grammar-rule/domain/repositories/grammar-rule.repository.interface.js';

const VARIANT_ID = 'variant-1';
const BODY = 'Sykepleieren jobber om natten.';

function makeVariant(body: string): LessonContentVariantEntity {
  const result = LessonContentVariantEntity.create({
    lessonId: 'lesson-1',
    explanationLanguage: 'en',
    minLevel: DifficultyLevel.A1,
    maxLevel: DifficultyLevel.A2,
    displayTitle: 'Yrker — EN',
    bodyMarkdown: body,
    createdByUserId: 'owner-1',
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeSpan(
  overrides: Partial<{ kind: LessonSpanKind; refId: string | null; snapshot: string }> = {},
): LessonTextSpanEntity {
  const result = LessonTextSpanEntity.create({
    lessonContentVariantId: VARIANT_ID,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: 12,
    kind: overrides.kind ?? LessonSpanKind.VOCAB,
    refId: overrides.refId === undefined ? 'vocab-1' : overrides.refId,
    textSnapshot: overrides.snapshot ?? 'Sykepleieren',
    createdByUserId: 'owner-1',
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(
  overrides: {
    body?: string;
    spans?: LessonTextSpanEntity[];
    vocabularyItem?: { deletedAt: Date | null } | null;
    grammarRule?: { deletedAt: Date | null } | null;
    variantMissing?: boolean;
  } = {},
) {
  const variantRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides.variantMissing ? null : makeVariant(overrides.body ?? BODY)),
  } as unknown as ILessonContentVariantRepository;

  const spanRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.spans ?? []),
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    deleteByVariantAndRef: jest.fn(),
  } as unknown as ILessonTextSpanRepository;

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

  return {
    handler: new GetTextSpansHandler(variantRepo, spanRepo, vocabularyItemRepo, grammarRuleRepo),
  };
}

describe('GetTextSpansHandler', () => {
  it('returns intact spans with no broken reason', async () => {
    const { handler } = makeHandler({ spans: [makeSpan()] });

    const result = await handler.execute(new GetTextSpansQuery(VARIANT_ID, false));

    expect(result.value).toHaveLength(1);
    expect(result.value[0].brokenReason).toBeNull();
    expect(result.value[0].reanchorCandidates).toEqual([]);
  });

  it('hides a span whose anchor no longer holds from the reader', async () => {
    const { handler } = makeHandler({
      body: `«${BODY}`,
      spans: [makeSpan()],
    });

    const result = await handler.execute(new GetTextSpansQuery(VARIANT_ID, false));

    expect(result.value).toEqual([]);
  });

  it('gives the author the broken span plus where its text moved to', async () => {
    const { handler } = makeHandler({
      body: `«${BODY}`,
      spans: [makeSpan()],
    });

    const result = await handler.execute(new GetTextSpansQuery(VARIANT_ID, true));

    expect(result.value[0].brokenReason).toBe('offset');
    expect(result.value[0].reanchorCandidates).toEqual([
      { paragraphIndex: 0, charStart: 1, charEnd: 13 },
    ]);
  });

  it('treats a deleted referent as broken, with no re-anchor to offer', async () => {
    const { handler } = makeHandler({
      spans: [makeSpan()],
      vocabularyItem: { deletedAt: new Date() },
    });

    const result = await handler.execute(new GetTextSpansQuery(VARIANT_ID, true));

    expect(result.value[0].brokenReason).toBe('ref');
    expect(result.value[0].reanchorCandidates).toEqual([]);
  });

  it('resolves grammar referents against grammar rules, not vocabulary', async () => {
    const { handler } = makeHandler({
      spans: [makeSpan({ kind: LessonSpanKind.GRAMMAR, refId: 'rule-1' })],
      vocabularyItem: null,
    });

    const result = await handler.execute(new GetTextSpansQuery(VARIANT_ID, false));

    expect(result.value).toHaveLength(1);
  });

  it('keeps chunk spans, which reference nothing', async () => {
    const { handler } = makeHandler({
      spans: [makeSpan({ kind: LessonSpanKind.CHUNK, refId: null })],
      vocabularyItem: null,
    });

    const result = await handler.execute(new GetTextSpansQuery(VARIANT_ID, false));

    expect(result.value).toHaveLength(1);
  });

  it('404s on a missing variant', async () => {
    const { handler } = makeHandler({ variantMissing: true });

    const result = await handler.execute(new GetTextSpansQuery(VARIANT_ID, false));

    expect(result.error).toBe(LessonDomainError.VARIANT_NOT_FOUND);
  });
});
