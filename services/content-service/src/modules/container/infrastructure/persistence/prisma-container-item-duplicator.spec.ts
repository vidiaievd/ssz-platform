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

function makeDuplicator(opts?: { row?: unknown; source?: unknown; lesson?: unknown }) {
  const calls: string[] = [];
  const tx = {
    containerItem: {
      findFirst: jest.fn().mockResolvedValue(opts && 'row' in opts ? opts.row : ROW),
      create: jest.fn(({ data }) => {
        calls.push('row');
        return { id: 'row-copy', ...data };
      }),
    },
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
});
