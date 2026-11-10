/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async ports */
jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { SchoolMaterialsPrismaStore } from './school-materials.prisma.store.js';

const SCHOOL = 'school-1';

type Rows = Record<string, unknown[]>;

/** Every model answers findMany with its rows; deletes record their `where`. */
function fakePrisma(rows: Rows) {
  const log: Array<[string, string, unknown]> = [];
  const model = (name: string) => ({
    findMany: jest.fn(async (args: unknown) => {
      log.push([name, 'findMany', args]);
      return rows[name] ?? [];
    }),
    deleteMany: jest.fn(async (args: unknown) => {
      log.push([name, 'deleteMany', args]);
      return { count: (rows[`${name}:deleted`] as unknown[] | undefined)?.length ?? 1 };
    }),
    updateMany: jest.fn(async (args: unknown) => {
      log.push([name, 'updateMany', args]);
      return { count: 1 };
    }),
  });
  const names = [
    'container',
    'lesson',
    'vocabularyList',
    'grammarRule',
    'exercise',
    'tag',
    'canDoDescriptor',
    'vocabularyItem',
    'grammarRuleAtom',
    'containerItem',
    'lessonListeningStage',
    'lessonVideoQuestion',
    'lessonVariantGlossaryMark',
    'lessonTextSpan',
    'exerciseItemTarget',
    'grammarRuleExercisePool',
    'contentShare',
    'personalVocabularyEntry',
    'tagAssignment',
    'contentRelation',
    'contentEntitlement',
    'containerVersion',
    'contentAuditLog',
    'workspaceCoverageRecipe',
  ];
  const prisma: Record<string, unknown> = Object.fromEntries(names.map((n) => [n, model(n)]));
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma, log };
}

function store(rows: Rows) {
  const { prisma, log } = fakePrisma(rows);
  const published: Array<[string, unknown]> = [];
  const events = {
    publish: jest.fn(async (type: string, e: unknown) => void published.push([type, e])),
  };
  return {
    store: new SchoolMaterialsPrismaStore(prisma as never, events as never),
    log,
    published,
  };
}

describe('SchoolMaterialsPrismaStore.loadGraph', () => {
  it("turns the school's rows into edges and anybody else's into holds", async () => {
    const { store: s } = store({
      container: [{ id: 'C1', containerType: 'COURSE' }],
      lesson: [{ id: 'L1' }],
      vocabularyList: [{ id: 'V1' }],
      exercise: [{ id: 'E1' }],
      vocabularyItem: [{ id: 'I1', vocabularyListId: 'V1' }],
      // Both reads of container items answer the same rows here; the second is the foreign one.
      containerItem: [
        { itemType: 'LESSON', itemId: 'L1', containerVersion: { containerId: 'C1' } },
      ],
      lessonListeningStage: [{ exerciseId: 'E1', variant: { lessonId: 'FOREIGN-LESSON' } }],
      contentShare: [{ entityType: 'LESSON', entityId: 'L1' }],
      personalVocabularyEntry: [{ vocabularyItemId: 'I1' }],
    });

    const graph = await s.loadGraph(SCHOOL, new Date('2026-11-10T00:00:00Z'));

    expect(graph.materials).toEqual(
      expect.arrayContaining([
        { kind: 'container', id: 'C1', containerType: 'course' },
        { kind: 'lesson', id: 'L1' },
        { kind: 'vocabulary_list', id: 'V1' },
        { kind: 'exercise', id: 'E1' },
      ]),
    );
    expect(graph.edges).toContainEqual({
      from: { kind: 'container', id: 'C1' },
      to: { kind: 'lesson', id: 'L1' },
    });
    expect(graph.holds).toEqual(
      expect.arrayContaining([
        { to: { kind: 'lesson', id: 'L1' }, reason: 'foreign_reference' },
        { to: { kind: 'exercise', id: 'E1' }, reason: 'foreign_reference' },
        { to: { kind: 'lesson', id: 'L1' }, reason: 'share' },
        { to: { kind: 'vocabulary_list', id: 'V1' }, reason: 'personal_word' },
      ]),
    );
  });

  it('reads foreign container items only from live containers of other owners', async () => {
    const { store: s, log } = store({ lesson: [{ id: 'L1' }] });
    await s.loadGraph(SCHOOL, new Date());
    const foreignRead = log.find(
      ([m, op, args]) =>
        m === 'containerItem' && op === 'findMany' && JSON.stringify(args).includes('itemId'),
    );
    expect(foreignRead?.[2]).toMatchObject({
      where: {
        itemId: { in: ['L1'] },
        containerVersion: {
          container: {
            deletedAt: null,
            OR: [{ ownerSchoolId: null }, { ownerSchoolId: { not: SCHOOL } }],
          },
        },
      },
    });
  });

  it('counts only live, unexpired shares', async () => {
    const now = new Date('2026-11-10T00:00:00Z');
    const { store: s, log } = store({ lesson: [{ id: 'L1' }] });
    await s.loadGraph(SCHOOL, now);
    const shares = log.find(([m]) => m === 'contentShare');
    expect(shares?.[2]).toMatchObject({
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    });
  });
});

describe('SchoolMaterialsPrismaStore.deleteMaterials', () => {
  it("announces each container, then deletes only the school's rows with what describes them", async () => {
    const {
      store: s,
      log,
      published,
    } = store({ container: [{ id: 'C1', ownerUserId: 'author' }] });

    await s.deleteMaterials(SCHOOL, [{ kind: 'container', id: 'C1', containerType: 'course' }]);

    expect(published).toHaveLength(1);
    expect(published[0][0]).toBe('content.container.deleted');
    expect((published[0][1] as { payload: unknown }).payload).toEqual({
      containerId: 'C1',
      ownerUserId: 'author',
    });
    const deletes = log.filter(([, op]) => op === 'deleteMany').map(([m]) => m);
    expect(deletes).toEqual([
      'tagAssignment',
      'contentShare',
      'contentRelation',
      'contentAuditLog',
      'contentEntitlement',
      'containerVersion',
      'container',
    ]);
    const containerDelete = log.find(([m, op]) => m === 'container' && op === 'deleteMany');
    expect(containerDelete?.[2]).toEqual({ where: { id: { in: ['C1'] }, ownerSchoolId: SCHOOL } });
  });

  it("touches nothing for a container that is not the school's (already gone, or another owner)", async () => {
    const { store: s, log, published } = store({ container: [] });
    await s.deleteMaterials(SCHOOL, [
      { kind: 'container', id: 'C-other', containerType: 'course' },
    ]);
    expect(published).toEqual([]);
    expect(log.filter(([, op]) => op === 'deleteMany')).toEqual([]);
  });

  it('guards every material delete with the school as owner', async () => {
    const { store: s, log } = store({});
    await s.deleteMaterials(SCHOOL, [
      { kind: 'lesson', id: 'L1' },
      { kind: 'exercise', id: 'E1' },
      { kind: 'vocabulary_list', id: 'V1' },
      { kind: 'grammar_rule', id: 'R1' },
      { kind: 'tag', id: 'T1' },
      { kind: 'can_do', id: 'D1' },
    ]);
    for (const model of [
      'lesson',
      'exercise',
      'vocabularyList',
      'grammarRule',
      'tag',
      'canDoDescriptor',
    ]) {
      const call = log.find(([m, op]) => m === model && op === 'deleteMany');
      expect(call?.[2]).toMatchObject({ where: { ownerSchoolId: SCHOOL } });
    }
  });
});
