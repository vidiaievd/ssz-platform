import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetNextPracticeHandler } = await import(
  '../../../../src/modules/student-analytics/queries/get-next-practice.handler.js'
);
const { GetNextPracticeQuery } = await import(
  '../../../../src/modules/student-analytics/queries/student-analytics.queries.js'
);

const STUDENT = 'student-1';
const VIEWER = 'teacher-1';
const NOW = Date.now();

const day = (offset: number): string => new Date(NOW + offset * 86_400_000).toISOString();

interface CardInput {
  atomId: string;
  dueAt?: string;
  stability?: number;
  reps?: number;
  lapses?: number;
  atomType?: string;
  track?: string;
}

function card(input: CardInput) {
  return {
    atomType: input.atomType ?? 'vocabulary_item',
    atomId: input.atomId,
    track: input.track ?? 'lexis',
    state: 'REVIEW',
    dueAt: input.dueAt ?? day(-1),
    stability: input.stability ?? 30,
    difficulty: 5,
    reps: input.reps ?? 4,
    lapses: input.lapses ?? 0,
    lastReviewedAt: day(-8),
  };
}

interface GapInput {
  atomId: string;
  verdict: string;
  gap?: number | null;
  atomType?: string;
}

function gapFinding(input: GapInput) {
  return {
    atomType: input.atomType ?? 'vocabulary_item',
    atomId: input.atomId,
    title: `title-${input.atomId}`,
    track: 'lexis',
    parentId: null,
    verdict: input.verdict,
    gap: input.gap ?? null,
    cardReviews: 0,
    byModality: {
      recognition: { attempts: 6, correct: 6, rate: 1, averageStability: null, lastAt: null },
      recall: { attempts: 0, correct: 0, rate: null, averageStability: null, lastAt: null },
      production: { attempts: 0, correct: 0, rate: null, averageStability: null, lastAt: null },
      unknown: { attempts: 0, correct: 0, rate: null, averageStability: null, lastAt: null },
    },
  };
}

interface UnitAtomInput {
  atomId: string;
  focusItems?: number;
  introducedBy?: string[];
}

function unitAtom(input: UnitAtomInput) {
  return {
    atomType: 'vocabulary_item',
    atomId: input.atomId,
    title: `title-${input.atomId}`,
    track: 'lexis',
    parentId: null,
    introducedBy: input.introducedBy ?? ['glossary'],
    focusItems: input.focusItems ?? 1,
    contextItems: 0,
    byModality: { recognition: 2, recall: 0, production: 0, unknown: 0 },
  };
}

function handlerFor(options: {
  cards?: ReturnType<typeof card>[] | null;
  gaps?: ReturnType<typeof gapFinding>[];
  courseAtoms?: ReturnType<typeof unitAtom>[] | null;
  unitAtoms?: ReturnType<typeof unitAtom>[] | null;
  outline?: Array<{ unitId: string; unitTitle: string | null; itemId: string }>;
  completedItemIds?: string[];
}) {
  const outline = options.outline ?? [];
  const completed = new Set(options.completedItemIds ?? []);

  const prisma = {
    courseOutlineItem: { findMany: () => Promise.resolve(outline) },
    itemProgress: {
      findMany: () =>
        Promise.resolve(
          outline.filter((row) => completed.has(row.itemId)).map((row) => ({ contentId: row.itemId })),
        ),
    },
  };

  const calls: string[] = [];
  const content = {
    getUnitAtoms: (containerId: string) => {
      calls.push(containerId);
      // The first call of a course-scoped run is the course itself, the second the unit.
      return Promise.resolve(
        containerId === 'unit-2' ? (options.unitAtoms ?? null) : (options.courseAtoms ?? null),
      );
    },
    describeAtoms: (refs: ReadonlyArray<{ atomType: string; atomId: string }>) =>
      Promise.resolve(
        new Map(
          refs.map((ref) => [
            `${ref.atomType}:${ref.atomId}`,
            {
              atomType: ref.atomType,
              atomId: ref.atomId,
              title: `title-${ref.atomId}`,
              track: 'lexis',
              parentId: null,
            },
          ]),
        ),
      ),
  };

  const learning = {
    getAtomCards: () => Promise.resolve(options.cards === undefined ? [] : options.cards),
  };

  const queryBus = {
    execute: () => Promise.resolve({ gaps: options.gaps ?? [] }),
  };

  const access = { assertMayRead: () => Promise.resolve() };

  const handler = new (GetNextPracticeHandler as never as new (
    access: unknown,
    prisma: unknown,
    content: unknown,
    learning: unknown,
    queryBus: unknown,
  ) => {
    execute: (query: unknown) => Promise<{
      capacity: number;
      secondsPerItem: number;
      nextUnit: { unitId: string; unitTitle: string | null } | null;
      sources: Record<string, number | string[]>;
      candidates: Array<{
        atomId: string;
        title: string | null;
        reason: string;
        requiredModality: string;
        evidence: Record<string, unknown>;
      }>;
    }>;
  })(access, prisma, content, learning, queryBus);

  return { handler, calls };
}

function query(courseId: string | null = null, budgetMinutes = 15) {
  return new (GetNextPracticeQuery as never as new (
    a: string,
    b: string,
    c: string | null,
    d: number,
  ) => unknown)(STUDENT, VIEWER, courseId, budgetMinutes);
}

describe('GetNextPracticeHandler (plan 63 phase 8)', () => {
  it('turns a budget into a number of probes', async () => {
    const { handler } = handlerFor({});

    const result = await handler.execute(query(null, 15));

    // Fifteen minutes at forty-five seconds a probe.
    expect(result.secondsPerItem).toBe(45);
    expect(result.capacity).toBe(20);
  });

  it('proposes an overdue card with the schedule as its evidence', async () => {
    const { handler } = handlerFor({ cards: [card({ atomId: 'w-1', dueAt: day(-3) })] });

    const result = await handler.execute(query());

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      atomId: 'w-1',
      reason: 'due',
      // A card is one number, not one per modality: asking for free production off the
      // back of it would be a demand the evidence cannot support.
      requiredModality: 'recall',
      title: 'title-w-1',
    });
    expect(result.candidates[0]?.evidence.overdueDays).toBe(3);
  });

  it('calls a card that keeps coming back weak rather than merely due', async () => {
    const { handler } = handlerFor({
      cards: [card({ atomId: 'w-1', dueAt: day(-1), reps: 6, lapses: 3, stability: 2 })],
    });

    const result = await handler.execute(query());

    expect(result.candidates[0]).toMatchObject({ atomId: 'w-1', reason: 'weak' });
    expect(result.sources.due).toBe(0);
    expect(result.sources.weak).toBe(1);
  });

  it('leaves a card that is neither due nor weak alone', async () => {
    const { handler } = handlerFor({ cards: [card({ atomId: 'w-1', dueAt: day(+4) })] });

    const result = await handler.execute(query());

    expect(result.candidates).toHaveLength(0);
  });

  it('asks for production where the learner has only ever recognised', async () => {
    const { handler } = handlerFor({
      gaps: [gapFinding({ atomId: 'w-9', verdict: 'production_untried' })],
    });

    const result = await handler.execute(query());

    expect(result.candidates[0]).toMatchObject({
      atomId: 'w-9',
      reason: 'modality-gap',
      requiredModality: 'production',
    });
  });

  it('asks for recall where recognition is all there has ever been', async () => {
    const { handler } = handlerFor({
      gaps: [gapFinding({ atomId: 'w-9', verdict: 'recognition_only' })],
    });

    const result = await handler.execute(query());

    expect(result.candidates[0]?.requiredModality).toBe('recall');
  });

  // The plan's own check: a list that is all `due` is a list the review queue already had.
  it('does not let the schedule fill the whole list', async () => {
    const { handler } = handlerFor({
      cards: Array.from({ length: 30 }, (_unused, index) =>
        card({ atomId: `due-${index}`, dueAt: day(-2) }),
      ),
      gaps: [
        gapFinding({ atomId: 'gap-1', verdict: 'production_untried' }),
        gapFinding({ atomId: 'gap-2', verdict: 'recognition_only' }),
      ],
    });

    const result = await handler.execute(query(null, 5));

    const reasons = new Set(result.candidates.map((candidate) => candidate.reason));
    expect(reasons.has('due')).toBe(true);
    expect(reasons.has('modality-gap')).toBe(true);
    expect(result.candidates).toHaveLength(6);
  });

  it('claims an atom once, by the sharpest thing that can be said about it', async () => {
    const { handler } = handlerFor({
      cards: [card({ atomId: 'w-1', dueAt: day(-5) })],
      gaps: [gapFinding({ atomId: 'w-1', verdict: 'production_untried' })],
    });

    const result = await handler.execute(query());

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.reason).toBe('modality-gap');
  });

  describe('looking ahead', () => {
    const outline = [
      { unitId: 'unit-1', unitTitle: 'Leksjon 1', itemId: 'item-1' },
      { unitId: 'unit-2', unitTitle: 'Leksjon 2', itemId: 'item-2' },
    ];

    it('proposes what the next unfinished unit introduces', async () => {
      const { handler } = handlerFor({
        outline,
        completedItemIds: ['item-1'],
        courseAtoms: [unitAtom({ atomId: 'new-1' })],
        unitAtoms: [unitAtom({ atomId: 'new-1', focusItems: 3 })],
      });

      const result = await handler.execute(query('course-1'));

      expect(result.nextUnit).toEqual({ unitId: 'unit-2', unitTitle: 'Leksjon 2' });
      expect(result.candidates[0]).toMatchObject({
        atomId: 'new-1',
        reason: 'upcoming',
        // A first meeting can honestly ask for nothing deeper.
        requiredModality: 'recognition',
      });
      expect(result.candidates[0]?.evidence.unitTitle).toBe('Leksjon 2');
    });

    it('says nothing is ahead once every item is done', async () => {
      const { handler } = handlerFor({
        outline,
        completedItemIds: ['item-1', 'item-2'],
        courseAtoms: [],
      });

      const result = await handler.execute(query('course-1'));

      expect(result.nextUnit).toBeNull();
      expect(result.sources.upcoming).toBe(0);
    });

    it('skips an upcoming atom the learner already has a card for', async () => {
      const { handler } = handlerFor({
        outline,
        completedItemIds: ['item-1'],
        cards: [card({ atomId: 'new-1', dueAt: day(+9) })],
        courseAtoms: [unitAtom({ atomId: 'new-1' })],
        unitAtoms: [unitAtom({ atomId: 'new-1' })],
      });

      const result = await handler.execute(query('course-1'));

      expect(result.candidates).toHaveLength(0);
    });

    it('skips an atom the unit only practises — that is revision, not new material', async () => {
      const { handler } = handlerFor({
        outline,
        completedItemIds: ['item-1'],
        courseAtoms: [unitAtom({ atomId: 'old-1', introducedBy: [] })],
        unitAtoms: [unitAtom({ atomId: 'old-1', introducedBy: [] })],
      });

      const result = await handler.execute(query('course-1'));

      expect(result.candidates).toHaveLength(0);
    });
  });

  describe('a course narrows the schedule', () => {
    it('drops cards for atoms the course does not teach', async () => {
      const { handler } = handlerFor({
        cards: [card({ atomId: 'in-course' }), card({ atomId: 'elsewhere' })],
        courseAtoms: [unitAtom({ atomId: 'in-course' })],
        outline: [],
      });

      const result = await handler.execute(query('course-1'));

      expect(result.candidates.map((candidate) => candidate.atomId)).toEqual(['in-course']);
    });
  });

  // A thin list is true; an empty one from an unreachable service is a lie.
  it('names the source it could not ask instead of reporting nothing due', async () => {
    const { handler } = handlerFor({
      cards: null,
      gaps: [gapFinding({ atomId: 'w-9', verdict: 'production_untried' })],
    });

    const result = await handler.execute(query());

    expect(result.sources.unavailable).toEqual(['schedule']);
    expect(result.candidates).toHaveLength(1);
  });
});
