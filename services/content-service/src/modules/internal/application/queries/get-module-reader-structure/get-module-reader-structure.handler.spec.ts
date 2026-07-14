jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import { GetModuleReaderStructureHandler } from './get-module-reader-structure.handler.js';
import { GetModuleReaderStructureQuery } from './get-module-reader-structure.query.js';
import { LessonKind } from '../../../../lesson/domain/value-objects/lesson-kind.vo.js';

const MODULE_ID = 'module-1';
const VERSION_ID = 'version-1';
const SECTION_ID = 'section-1';
const LESSON_ITEM_ID = 'item-lesson-1';
const LESSON_ID = 'lesson-1';
const VOCAB_ITEM_ID = 'item-vocab-1';
const VOCAB_LIST_ID = 'vocab-list-1';
const GRAMMAR_ITEM_ID = 'item-grammar-1';
const GRAMMAR_RULE_ID = 'grammar-rule-1';
const EXERCISE_ITEM_ID = 'item-exercise-1';
const EXERCISE_ID = 'exercise-1';

function makePrismaStub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    container: {
      findUnique: jest.fn().mockResolvedValue({
        id: MODULE_ID,
        title: 'Leksjon 17',
        currentPublishedVersionId: VERSION_ID,
      }),
    },
    containerSection: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: SECTION_ID, containerVersionId: VERSION_ID, title: 'Reading', position: 0 },
        ]),
    },
    containerItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: LESSON_ITEM_ID,
          itemType: 'LESSON',
          itemId: LESSON_ID,
          position: 0,
          sectionId: SECTION_ID,
          xpReward: 10,
        },
        {
          id: VOCAB_ITEM_ID,
          itemType: 'VOCABULARY_LIST',
          itemId: VOCAB_LIST_ID,
          position: 1,
          sectionId: null,
          xpReward: null,
        },
        {
          id: GRAMMAR_ITEM_ID,
          itemType: 'GRAMMAR_RULE',
          itemId: GRAMMAR_RULE_ID,
          position: 2,
          sectionId: null,
          xpReward: 5,
        },
        {
          id: EXERCISE_ITEM_ID,
          itemType: 'EXERCISE',
          itemId: EXERCISE_ID,
          position: 3,
          sectionId: null,
          xpReward: null,
        },
      ]),
    },
    lesson: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: LESSON_ID, title: 'Å bo i Norge', kind: 'TEXT' }]),
    },
    lessonContentVariant: {
      findMany: jest.fn().mockResolvedValue([{ lessonId: LESSON_ID, estimatedReadingMinutes: 6 }]),
    },
    vocabularyList: {
      findMany: jest.fn().mockResolvedValue([{ id: VOCAB_LIST_ID, title: 'Bolig-ord' }]),
    },
    grammarRule: {
      findMany: jest.fn().mockResolvedValue([{ id: GRAMMAR_RULE_ID, title: 'Presens' }]),
    },
    grammarRuleExplanation: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ grammarRuleId: GRAMMAR_RULE_ID, estimatedReadingMinutes: 4 }]),
    },
    exercise: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: EXERCISE_ID,
          estimatedDurationSeconds: 90,
          template: { name: 'Gap fill' },
        },
      ]),
    },
    ...overrides,
  };
}

describe('GetModuleReaderStructureHandler', () => {
  it('returns sections with items in position order and resolves title/kind/duration/xp', async () => {
    const prisma = makePrismaStub();
    const handler = new GetModuleReaderStructureHandler(prisma as never);

    const result = await handler.execute(new GetModuleReaderStructureQuery(MODULE_ID));

    expect(result.moduleId).toBe(MODULE_ID);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].items).toEqual([
      expect.objectContaining({
        refId: LESSON_ID,
        title: 'Å bo i Norge',
        lessonKind: LessonKind.TEXT,
        durationMinutes: 6,
        position: 0,
        xpReward: 10,
      }),
    ]);
    expect(result.ungroupedItems).toEqual([
      expect.objectContaining({
        refId: VOCAB_LIST_ID,
        title: 'Bolig-ord',
        lessonKind: null,
        durationMinutes: null,
        xpReward: null,
      }),
      expect.objectContaining({
        refId: GRAMMAR_RULE_ID,
        title: 'Presens',
        durationMinutes: 4,
        xpReward: 5,
      }),
      expect.objectContaining({
        refId: EXERCISE_ID,
        title: 'Gap fill',
        durationMinutes: 2,
        xpReward: null,
      }),
    ]);
  });

  it('throws NotFoundException when the module does not exist', async () => {
    const prisma = makePrismaStub({ container: { findUnique: jest.fn().mockResolvedValue(null) } });
    const handler = new GetModuleReaderStructureHandler(prisma as never);

    await expect(handler.execute(new GetModuleReaderStructureQuery('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns empty sections when the module has no published version', async () => {
    const prisma = makePrismaStub({
      container: {
        findUnique: jest.fn().mockResolvedValue({
          id: MODULE_ID,
          title: 'Draft-only',
          currentPublishedVersionId: null,
        }),
      },
    });
    const handler = new GetModuleReaderStructureHandler(prisma as never);

    const result = await handler.execute(new GetModuleReaderStructureQuery(MODULE_ID));

    expect(result.sections).toEqual([]);
    expect(result.ungroupedItems).toEqual([]);
  });
});
