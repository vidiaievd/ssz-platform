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

function makeDuplicator(opts?: { row?: unknown; source?: unknown }) {
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
      findFirst: jest.fn().mockResolvedValue(opts && 'source' in opts ? opts.source : SOURCE),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        calls.push('exercise');
        return data;
      }),
    },
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
});
