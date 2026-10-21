// Keep Jest away from the generated Prisma client (it uses import.meta). The adapter only
// needs `Prisma.JsonNull` from it, so a sentinel stands in.
jest.mock('../../../../../generated/prisma/client.js', () => ({
  Prisma: { JsonNull: 'JsonNull' },
}));
jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PrismaContainerItemDuplicator } from './prisma-container-item-duplicator.js';
import { Visibility } from '../../domain/value-objects/visibility.vo.js';

const VERSION_ID = 'version-1';
const ROW = {
  id: 'row-1',
  containerVersionId: VERSION_ID,
  position: 3,
  itemType: 'EXERCISE',
  itemId: 'exercise-1',
  isRequired: false,
  sectionId: 'section-1',
  sectionLabel: null,
  xpReward: 5,
};

const SOURCE = {
  id: 'exercise-1',
  exerciseTemplateId: 'template-1',
  title: 'Velg riktig ord',
  targetLanguage: 'nb',
  difficultyLevel: 'A2',
  content: { questions: [] },
  expectedAnswers: { answers: [] },
  answerCheckSettings: null,
  draftContent: { questions: ['draft'] },
  draftExpectedAnswers: { answers: ['draft'] },
  draftAnswerCheckSettings: null,
  draftUpdatedAt: new Date('2026-10-17T10:00:00Z'),
  skillsOverride: ['reading'],
  focusOverride: [],
  overrideSetAt: new Date('2026-10-16T10:00:00Z'),
  ownerUserId: 'original-author',
  ownerSchoolId: null,
  visibility: 'PUBLIC',
  estimatedDurationSeconds: 120,
  template: { code: 'multiple_choice' },
  instructions: [
    {
      instructionLanguage: 'en',
      instructionText: 'Choose',
      hintText: null,
      textOverrides: null,
      draftInstructionText: 'Pick one',
      draftHintText: null,
      draftTextOverrides: null,
      draftUpdatedAt: new Date('2026-10-17T10:00:00Z'),
    },
  ],
  itemTargets: [{ itemKey: 'q1', atomType: 'VOCABULARY_ITEM', atomId: 'word-1', role: 'PRIMARY' }],
};

const LESSON_ROW = { ...ROW, itemType: 'LESSON', itemId: 'lesson-1' };

const LESSON = {
  id: 'lesson-1',
  targetLanguage: 'nb',
  difficultyLevel: 'A2',
  slug: 'leksjon-17-pa-butikken',
  title: 'På butikken',
  description: null,
  coverImageMediaId: 'cover-1',
  ownerUserId: 'original-author',
  ownerSchoolId: null,
  visibility: 'PUBLIC',
  kind: 'TEXT',
  liveStartsAt: null,
  liveDurationMinutes: null,
  liveJoinUrl: null,
  liveCapacity: null,
  variants: [
    {
      id: 'variant-1',
      explanationLanguage: 'en',
      minLevel: 'A2',
      maxLevel: 'A2',
      displayTitle: 'At the shop',
      displayDescription: null,
      bodyMarkdown: 'Kari går i butikken.',
      estimatedReadingMinutes: 3,
      transcript: null,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-01T10:00:00Z'),
      mediaRefs: [
        {
          mediaId: 'audio-1',
          mediaType: 'AUDIO',
          positionInText: 0,
          extractedAt: new Date('2026-10-01T10:00:00Z'),
        },
      ],
      videoCues: [],
      videoQuestion: null,
      // Two stages share exercise-1; the third points at an exercise deleted since.
      listeningStages: [
        { exerciseId: 'exercise-1', position: 0, stageType: 'GAP_FILL' },
        { exerciseId: 'exercise-1', position: 1, stageType: 'COMPREHENSION' },
        { exerciseId: 'exercise-gone', position: 2, stageType: 'COMPREHENSION' },
      ],
      paragraphTranslations: [{ paragraphIndex: 0, translation: 'Kari goes to the shop.' }],
      glossaryMarks: [{ vocabularyItemId: 'word-1', occurrenceCount: 2 }],
      textSpans: [
        {
          paragraphIndex: 0,
          charStart: 0,
          charEnd: 4,
          kind: 'VOCAB',
          refId: 'word-1',
          textSnapshot: 'Kari',
          note: null,
        },
      ],
    },
  ],
};

const MODULE_ROW = { ...ROW, itemType: 'CONTAINER', itemId: 'module-1', sectionId: 'level-a2' };

const MODULE = {
  id: 'module-1',
  slug: 'leksjon-17',
  containerType: 'MODULE',
  targetLanguage: 'nb',
  difficultyLevel: 'A2',
  title: 'Leksjon 17',
  description: 'Handel',
  coverImageMediaId: null,
  ownerUserId: 'original-author',
  ownerSchoolId: 'school-1',
  visibility: 'SCHOOL_PRIVATE',
  accessTier: 'FREE_WITHIN_SCHOOL',
  levelSystem: 'CEFR',
  gatingMode: 'OPEN',
  reviewRespondWithinHours: null,
  coverageRecipe: null,
  learningGoals: ['Handle i butikken'],
  localizations: [{ languageCode: 'ru', title: 'Урок 17', description: null }],
};

const moduleRow = (
  position: number,
  itemType: string,
  itemId: string,
  sectionId: string | null,
) => ({
  id: `module-row-${position}`,
  containerVersionId: 'module-version-1',
  position,
  itemType,
  itemId,
  isRequired: position !== 2,
  sectionId,
  sectionLabel: null,
  xpReward: null,
});

const MODULE_VERSION = {
  id: 'module-version-1',
  status: 'DRAFT',
  sections: [{ id: 'section-text', title: 'Tekst', position: 0 }],
  // The lesson's stages use exercise-1 too; exercise-gone is deleted since.
  items: [
    moduleRow(0, 'LESSON', 'lesson-1', 'section-text'),
    moduleRow(1, 'VOCABULARY_LIST', 'list-1', 'section-text'),
    moduleRow(2, 'EXERCISE', 'exercise-1', null),
    moduleRow(3, 'EXERCISE', 'exercise-gone', null),
    moduleRow(4, 'EXERCISE', 'exercise-1', 'section-text'),
  ],
};

function makeDuplicator(opts?: {
  row?: unknown;
  source?: unknown;
  lesson?: unknown;
  module?: unknown;
  moduleVersion?: unknown;
}) {
  const calls: string[] = [];
  const tx = {
    containerItem: {
      findFirst: jest.fn().mockResolvedValue(opts && 'row' in opts ? opts.row : ROW),
      create: jest.fn(({ data }) => {
        calls.push('row');
        return { id: 'row-copy', ...data };
      }),
      createMany: jest.fn(({ data }: { data: Record<string, any> }) => {
        calls.push('module rows');
        return data;
      }),
    },
    container: {
      findFirst: jest.fn().mockResolvedValue(opts && 'module' in opts ? opts.module : MODULE),
      create: jest.fn(({ data }: { data: Record<string, any> }) => {
        calls.push('container');
        return data;
      }),
    },
    containerLocalization: { createMany: jest.fn() },
    containerVersion: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts && 'moduleVersion' in opts ? opts.moduleVersion : MODULE_VERSION),
      create: jest.fn(({ data }: { data: Record<string, any> }) => {
        calls.push('version');
        return data;
      }),
    },
    containerSection: { create: jest.fn() },
    exercise: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) => {
        if (where.id !== 'exercise-1') return null;
        return opts && 'source' in opts ? opts.source : SOURCE;
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        calls.push('exercise');
        return data;
      }),
    },
    lesson: {
      findFirst: jest.fn().mockResolvedValue(opts && 'lesson' in opts ? opts.lesson : LESSON),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        calls.push('lesson');
        return data;
      }),
    },
    lessonContentVariant: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        calls.push('variant');
        return data;
      }),
    },
    lessonVariantMediaRef: { createMany: jest.fn() },
    lessonVideoCue: { createMany: jest.fn() },
    lessonParagraphTranslation: { createMany: jest.fn() },
    lessonVariantGlossaryMark: { createMany: jest.fn() },
    lessonTextSpan: { createMany: jest.fn() },
    lessonListeningStage: { createMany: jest.fn() },
    lessonVideoQuestion: { create: jest.fn() },
    exerciseInstruction: { createMany: jest.fn() },
    exerciseItemTarget: { createMany: jest.fn() },
    contentRelation: {
      findMany: jest.fn().mockResolvedValue([
        {
          sourceType: 'VOCABULARY_ITEM',
          sourceId: 'word-1',
          targetType: 'EXERCISE',
          targetId: 'exercise-1',
          relationKind: 'PRACTICED_BY',
          ownerSchoolId: null,
        },
      ]),
      createMany: jest.fn(),
    },
    $executeRaw: jest.fn((strings: TemplateStringsArray) => {
      calls.push(strings.join('?').includes('-"position" - 1') ? 'park' : 'flip');
      return 1;
    }),
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return {
    duplicator: new PrismaContainerItemDuplicator(prisma as any),
    tx,
    calls,
  };
}

const INPUT = {
  versionId: VERSION_ID,
  rowId: 'row-1',
  userId: 'duplicating-teacher',
  ownerSchoolId: 'school-1',
  visibility: Visibility.SCHOOL_PRIVATE,
};

describe('PrismaContainerItemDuplicator', () => {
  it('copies both documents and the override, under the new owner pair', async () => {
    const { duplicator, tx } = makeDuplicator();

    const copy = await duplicator.duplicateExerciseRow(INPUT);

    const data = tx.exercise.create.mock.calls[0][0].data;
    expect(data.id).toBe(copy?.exerciseId);
    expect(data).toMatchObject({
      exerciseTemplateId: 'template-1',
      title: 'Velg riktig ord',
      content: SOURCE.content,
      draftContent: SOURCE.draftContent,
      draftUpdatedAt: SOURCE.draftUpdatedAt,
      answerCheckSettings: 'JsonNull',
      skillsOverride: ['reading'],
      overrideSetAt: SOURCE.overrideSetAt,
      ownerUserId: 'duplicating-teacher',
      ownerSchoolId: 'school-1',
      visibility: 'SCHOOL_PRIVATE',
    });
  });

  it('copies instructions, targets and relations onto the copy', async () => {
    const { duplicator, tx } = makeDuplicator();

    const copy = await duplicator.duplicateExerciseRow(INPUT);
    const id = copy?.exerciseId;

    expect(tx.exerciseInstruction.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ exerciseId: id, draftInstructionText: 'Pick one' }),
    ]);
    expect(tx.exerciseItemTarget.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ exerciseId: id, itemKey: 'q1', atomId: 'word-1' }),
    ]);
    expect(tx.contentRelation.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ sourceId: 'word-1', targetId: id, relationKind: 'PRACTICED_BY' }),
    ]);
  });

  it('places the copy right after the row, after moving the tail in two passes', async () => {
    const { duplicator, tx, calls } = makeDuplicator();

    const copy = await duplicator.duplicateExerciseRow(INPUT);

    expect(calls).toEqual(['exercise', 'park', 'flip', 'row']);
    expect(copy?.position).toBe(4);
    expect(tx.containerItem.create.mock.calls[0][0].data).toMatchObject({
      position: 4,
      itemType: 'EXERCISE',
      itemId: copy?.exerciseId,
      sectionId: 'section-1',
      isRequired: false,
      xpReward: 5,
    });
  });

  it('copies nothing when the row is gone', async () => {
    const { duplicator, tx } = makeDuplicator({ row: null });

    expect(await duplicator.duplicateExerciseRow(INPUT)).toBeNull();
    expect(tx.exercise.create).not.toHaveBeenCalled();
  });

  it('copies nothing when the exercise is deleted', async () => {
    const { duplicator, tx } = makeDuplicator({ source: null });

    expect(await duplicator.duplicateExerciseRow(INPUT)).toBeNull();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  describe('lesson rows', () => {
    it('copies the lesson without its slug, under the new owner pair', async () => {
      const { duplicator, tx } = makeDuplicator({ row: LESSON_ROW });

      const copy = await duplicator.duplicateLessonRow(INPUT);

      const data = tx.lesson.create.mock.calls[0][0].data;
      expect(data.id).toBe(copy?.lessonId);
      expect(data).toMatchObject({
        slug: null,
        title: 'På butikken',
        coverImageMediaId: 'cover-1',
        kind: 'TEXT',
        ownerUserId: 'duplicating-teacher',
        ownerSchoolId: 'school-1',
        visibility: 'SCHOOL_PRIVATE',
      });
    });

    it('copies every variant with its status and its child rows', async () => {
      const { duplicator, tx } = makeDuplicator({ row: LESSON_ROW });

      const copy = await duplicator.duplicateLessonRow(INPUT);
      const variantId = copy?.variants[0].variantId;

      expect(copy?.variants).toEqual([
        { variantId, explanationLanguage: 'en', minLevel: 'A2', maxLevel: 'A2' },
      ]);
      expect(tx.lessonContentVariant.create.mock.calls[0][0].data).toMatchObject({
        id: variantId,
        lessonId: copy?.lessonId,
        bodyMarkdown: 'Kari går i butikken.',
        status: 'PUBLISHED',
        publishedAt: LESSON.variants[0].publishedAt,
        createdByUserId: 'duplicating-teacher',
      });
      expect(tx.lessonVariantMediaRef.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({ lessonContentVariantId: variantId, mediaId: 'audio-1' }),
      ]);
      expect(tx.lessonParagraphTranslation.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({ lessonContentVariantId: variantId, paragraphIndex: 0 }),
      ]);
      expect(tx.lessonVariantGlossaryMark.createMany.mock.calls[0][0].data).toEqual([
        { lessonContentVariantId: variantId, vocabularyItemId: 'word-1', occurrenceCount: 2 },
      ]);
      expect(tx.lessonTextSpan.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({
          lessonContentVariantId: variantId,
          refId: 'word-1',
          textSnapshot: 'Kari',
          createdByUserId: 'duplicating-teacher',
        }),
      ]);
      expect(tx.lessonVideoCue.createMany).not.toHaveBeenCalled();
      expect(tx.lessonVideoQuestion.create).not.toHaveBeenCalled();
    });

    it('copies a stage exercise once, and drops the stage of a deleted one', async () => {
      const { duplicator, tx } = makeDuplicator({ row: LESSON_ROW });

      const copy = await duplicator.duplicateLessonRow(INPUT);

      expect(tx.exercise.create).toHaveBeenCalledTimes(1);
      const stageCopy = copy?.exercises[0].exerciseId;
      expect(copy?.exercises).toEqual([
        { exerciseId: stageCopy, templateCode: 'multiple_choice', targetLanguage: 'nb' },
      ]);
      expect(tx.lessonListeningStage.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({ exerciseId: stageCopy, position: 0, stageType: 'GAP_FILL' }),
        expect.objectContaining({ exerciseId: stageCopy, position: 1, stageType: 'COMPREHENSION' }),
      ]);
    });

    it('places the copy right after the row as a lesson row', async () => {
      const { duplicator, tx, calls } = makeDuplicator({ row: LESSON_ROW });

      const copy = await duplicator.duplicateLessonRow(INPUT);

      expect(calls).toEqual(['lesson', 'variant', 'exercise', 'park', 'flip', 'row']);
      expect(tx.containerItem.create.mock.calls[0][0].data).toMatchObject({
        position: 4,
        itemType: 'LESSON',
        itemId: copy?.lessonId,
        sectionId: 'section-1',
      });
    });

    it('copies nothing when the lesson is deleted', async () => {
      const { duplicator, tx } = makeDuplicator({ row: LESSON_ROW, lesson: null });

      expect(await duplicator.duplicateLessonRow(INPUT)).toBeNull();
      expect(tx.lesson.create).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('module rows', () => {
    it('copies the module without its slug, under the new owner pair, with a draft v1', async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW });

      const copy = await duplicator.duplicateModuleRow(INPUT);

      const data = tx.container.create.mock.calls[0][0].data;
      expect(data.id).toBe(copy?.containerId);
      expect(data).toMatchObject({
        slug: null,
        containerType: 'MODULE',
        title: 'Leksjon 17',
        description: 'Handel',
        ownerUserId: 'duplicating-teacher',
        ownerSchoolId: 'school-1',
        visibility: 'SCHOOL_PRIVATE',
        accessTier: 'FREE_WITHIN_SCHOOL',
      });
      expect(tx.containerVersion.create.mock.calls[0][0].data).toEqual({
        id: copy?.versionId,
        containerId: copy?.containerId,
        versionNumber: 1,
        status: 'DRAFT',
        createdByUserId: 'duplicating-teacher',
      });
      expect(tx.containerLocalization.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({ containerId: copy?.containerId, languageCode: 'ru' }),
      ]);
    });

    it('reads the draft first, else the published version', async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW });

      await duplicator.duplicateModuleRow(INPUT);

      expect(tx.containerVersion.findFirst.mock.calls[0][0]).toMatchObject({
        where: { containerId: 'module-1', status: { in: ['DRAFT', 'PUBLISHED'] } },
        orderBy: [{ status: 'asc' }, { versionNumber: 'desc' }],
      });
    });

    it('takes the default access tier when the course has another visibility', async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW });

      await duplicator.duplicateModuleRow({ ...INPUT, visibility: Visibility.PUBLIC });

      expect(tx.container.create.mock.calls[0][0].data).toMatchObject({
        visibility: 'PUBLIC',
        accessTier: 'PUBLIC_FREE',
      });
    });

    it("carries the module's learning goals into the copy", async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW });

      await duplicator.duplicateModuleRow(INPUT);

      expect(tx.container.create.mock.calls[0][0].data.learningGoals).toEqual([
        'Handle i butikken',
      ]);
    });

    it('copies sections and rows: one copy per material, lists placed again', async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW });

      const copy = await duplicator.duplicateModuleRow(INPUT);

      const sectionId = tx.containerSection.create.mock.calls[0][0].data.id;
      expect(tx.containerSection.create.mock.calls[0][0].data).toEqual({
        id: sectionId,
        containerVersionId: copy?.versionId,
        title: 'Tekst',
        position: 0,
      });

      // exercise-1 is both a stage of the lesson and two rows: one copy for all three.
      expect(tx.exercise.create).toHaveBeenCalledTimes(1);
      expect(tx.lesson.create).toHaveBeenCalledTimes(1);
      const exerciseCopy = copy?.exercises[0].exerciseId;
      const lessonCopy = copy?.lessons[0].lessonId;
      expect(copy?.exercises).toHaveLength(1);
      expect(copy?.lessons).toHaveLength(1);

      const rows = tx.containerItem.createMany.mock.calls[0][0].data;
      expect(rows).toEqual([
        expect.objectContaining({ position: 0, itemType: 'LESSON', itemId: lessonCopy, sectionId }),
        expect.objectContaining({ position: 1, itemType: 'VOCABULARY_LIST', itemId: 'list-1' }),
        expect.objectContaining({
          position: 2,
          itemId: exerciseCopy,
          sectionId: null,
          isRequired: false,
        }),
        // The row of the deleted exercise (position 3) is dropped.
        expect.objectContaining({ position: 4, itemId: exerciseCopy, sectionId }),
      ]);
      expect(
        rows.every((r: { containerVersionId: string }) => r.containerVersionId === copy?.versionId),
      ).toBe(true);
    });

    it('re-points the module relations at the copy', async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW });

      await duplicator.duplicateModuleRow(INPUT);

      expect(tx.contentRelation.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { sourceType: 'CONTAINER', sourceId: 'module-1' },
            { targetType: 'CONTAINER', targetId: 'module-1' },
          ],
        },
      });
    });

    it('places the copy right after the row in the course, as a container row', async () => {
      const { duplicator, tx, calls } = makeDuplicator({ row: MODULE_ROW });

      const copy = await duplicator.duplicateModuleRow(INPUT);

      expect(calls.slice(0, 2)).toEqual(['container', 'version']);
      expect(calls.slice(-4)).toEqual(['module rows', 'park', 'flip', 'row']);
      expect(tx.containerItem.create.mock.calls[0][0].data).toMatchObject({
        containerVersionId: VERSION_ID,
        position: 4,
        itemType: 'CONTAINER',
        itemId: copy?.containerId,
        sectionId: 'level-a2',
      });
      expect(copy).toMatchObject({ rowId: 'row-copy', position: 4, title: 'Leksjon 17' });
    });

    it('copies an empty draft when the module has no version to read', async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW, moduleVersion: null });

      const copy = await duplicator.duplicateModuleRow(INPUT);

      expect(tx.containerVersion.create).toHaveBeenCalledTimes(1);
      expect(tx.containerItem.createMany).not.toHaveBeenCalled();
      expect(copy?.exercises).toEqual([]);
    });

    it('copies nothing when the module is deleted or not a module', async () => {
      const { duplicator, tx } = makeDuplicator({ row: MODULE_ROW, module: null });

      expect(await duplicator.duplicateModuleRow(INPUT)).toBeNull();
      expect(tx.container.findFirst.mock.calls[0][0].where).toMatchObject({
        containerType: 'MODULE',
        deletedAt: null,
      });
      expect(tx.container.create).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
