import { jest } from '@jest/globals';
import type { AttemptRatedPayload } from '@ssz/contracts';

// Importing the projector pulls in `PrismaService`, and with it the generated Prisma
// client, whose `import.meta` brings the whole run down under jest. Mocked at the module
// level — the projector only ever needs the shape below, and the real client would want a
// database anyway. (`unstable_mockModule` + dynamic import, because this service is ESM
// and a plain `jest.mock` is not hoisted there.)
jest.unstable_mockModule('../../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { SkillMasteryProjector } = await import(
  '../../../../../src/modules/metrics/mastery/skill-mastery.projector.js'
);

/** The measured half of a row — everything that is not part of a cell's identity. */
type MasteryColumns =
  | 'successRateEwma'
  | 'meanStability'
  | 'medianSecondsPerItem'
  | 'attempts'
  | 'weightedSample'
  | 'lastAttemptAt';

interface Row {
  id: string;
  userId: string;
  courseId: string | null;
  skill: string;
  focus: string;
  successRateEwma: number;
  meanStability: number | null;
  medianSecondsPerItem: number | null;
  attempts: number;
  weightedSample: number;
  lastAttemptAt: Date;
}

/** Yield to the event loop, so two folds running at once actually interleave. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A Postgres small enough to reason about, and the only part of it that matters is the
 * lock.
 *
 * Every read and write yields first, so two concurrent folds interleave the way they did
 * live. `$queryRaw` stands for the projector's `SELECT … FOR UPDATE`: it takes a per-cell
 * lock held until the surrounding `$transaction` ends. Take the lock away — as the code
 * had it before the fix — and the second fold reads the row before the first writes it,
 * which is exactly the lost attempt this suite is here to keep out.
 */
function fakePrisma() {
  const rows: Row[] = [];
  const locks = new Map<string, Promise<void>>();
  let sequence = 0;

  const key = (userId: string, courseId: string | null, skill: string, focus: string) =>
    `${userId}|${courseId ?? '∅'}|${skill}|${focus}`;

  const writes = {
    // Present so that a projector reading the row *without* taking the lock still runs —
    // the concurrency tests then fail by losing an attempt, which is the failure worth
    // seeing, rather than by calling a method the fake does not have.
    findFirst: async ({ where }: { where: Omit<Row, 'id' | keyof MasteryColumns> }) => {
      await tick();
      const cell = key(where.userId, where.courseId, where.skill, where.focus);
      return rows.find((row) => key(row.userId, row.courseId, row.skill, row.focus) === cell) ?? null;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      await tick();
      return rows.find((row) => row.id === where.id) ?? null;
    },
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      await tick();
      const row = { id: `row-${++sequence}`, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      await tick();
      const row = rows.find((r) => r.id === where.id);
      if (row === undefined) throw new Error(`no such row: ${where.id}`);
      Object.assign(row, data);
      return row;
    },
  };

  async function lockAndFind(
    values: unknown[],
    release: Array<() => void>,
  ): Promise<Array<{ id: string }>> {
    const [userId, courseId, skill, focus] = values as [string, string | null, string, string];
    const cell = key(userId, courseId, skill, focus);

    while (locks.has(cell)) await locks.get(cell);

    let unlock!: () => void;
    locks.set(
      cell,
      new Promise<void>((resolve) => {
        unlock = () => {
          locks.delete(cell);
          resolve();
        };
      }),
    );
    release.push(unlock);

    await tick();
    const row = rows.find(
      (r) => key(r.userId, r.courseId, r.skill, r.focus) === cell,
    );
    return row === undefined ? [] : [{ id: row.id }];
  }

  const client = {
    rows,
    skillMastery: writes,
    // Only ever the lock query. A raw call the projector does not make would land here
    // unlocked and the concurrency tests would fail — which is the point.
    $queryRaw: async () => {
      throw new Error('raw queries belong inside a transaction');
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const release: Array<() => void> = [];
      const tx = {
        skillMastery: writes,
        $queryRaw: (_strings: TemplateStringsArray, ...values: unknown[]) =>
          lockAndFind(values, release),
      };
      try {
        return await fn(tx);
      } finally {
        for (const unlock of release) unlock();
      }
    },
  };

  return client;
}

const config = { get: () => ({ ewmaAlpha: 0.2, minWeightedSample: 8 }) };

function projectorOver(prisma: ReturnType<typeof fakePrisma>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new SkillMasteryProjector(prisma as any, config as any);
}

const AT = '2026-09-02T10:00:00.000Z';

const attempt = (over: Partial<AttemptRatedPayload> = {}): AttemptRatedPayload => ({
  userId: 'learner-1',
  exerciseId: 'exercise-1',
  templateCode: 'word_bank_gap_fill',
  answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
  score: 100,
  passed: true,
  attemptOrdinal: 1,
  daysSinceLastReview: null,
  gapPosition: null,
  gapCount: null,
  ratingApplied: 'GOOD',
  skills: ['reading'],
  focus: [],
  containerId: 'course-1',
  timeSpentSeconds: null,
  stabilityAfter: null,
  workContext: null,
  groupId: null,
  lessonId: null,
  ...over,
});

describe('SkillMasteryProjector', () => {
  describe('concurrent attempts in one cell', () => {
    it('counts both when they are folded at the same time', async () => {
      // The live failure, in miniature: a gap-by-gap exercise publishes one event per gap
      // within milliseconds, and before the row was locked the second fold read the
      // profile before the first had written it. Nothing errored — the attempt simply
      // vanished, which is indistinguishable from an attempt that never happened.
      const prisma = fakePrisma();
      const projector = projectorOver(prisma);

      await Promise.all([
        projector.apply(attempt(), AT),
        projector.apply(attempt(), '2026-09-02T10:00:01.000Z'),
      ]);

      expect(prisma.rows).toHaveLength(1);
      expect(prisma.rows[0]?.attempts).toBe(2);
      expect(prisma.rows[0]?.weightedSample).toBeCloseTo(2);
    });

    it('ends on the latest attempt, not on whichever fold finished last', async () => {
      const prisma = fakePrisma();
      const projector = projectorOver(prisma);

      await Promise.all([
        projector.apply(attempt(), '2026-09-02T10:00:00.000Z'),
        projector.apply(attempt(), '2026-09-02T10:00:00.900Z'),
        projector.apply(attempt(), '2026-09-02T10:00:00.500Z'),
      ]);

      expect(prisma.rows[0]?.attempts).toBe(3);
      // Stale by four events is how the bug showed itself in the database, so the tail of
      // the burst is asserted, not just the count.
      expect(prisma.rows[0]?.lastAttemptAt.toISOString()).toBe('2026-09-02T10:00:00.500Z');
    });

    it('keeps separate cells apart while they are written at once', async () => {
      const prisma = fakePrisma();
      const projector = projectorOver(prisma);

      await Promise.all([
        projector.apply(attempt({ skills: ['reading'] }), AT),
        projector.apply(attempt({ skills: ['listening'] }), AT),
      ]);

      expect(prisma.rows.map((row) => row.skill).sort()).toEqual(['listening', 'reading']);
      expect(prisma.rows.every((row) => row.attempts === 1)).toBe(true);
    });
  });

  describe('which cells an attempt lands in', () => {
    it('counts one attempt in full in every cell it is evidence for', async () => {
      const prisma = fakePrisma();

      await projectorOver(prisma).apply(
        attempt({ skills: ['reading'], focus: ['grammar', 'vocabulary'] }),
        AT,
      );

      expect(prisma.rows.map((row) => `${row.skill}·${row.focus}`).sort()).toEqual([
        'reading·grammar',
        'reading·vocabulary',
      ]);
      expect(prisma.rows.every((row) => row.attempts === 1)).toBe(true);
    });

    it('buckets a missing axis under unknown rather than dropping the attempt', async () => {
      const prisma = fakePrisma();

      await projectorOver(prisma).apply(attempt({ skills: ['reading'], focus: [] }), AT);

      expect(prisma.rows[0]?.focus).toBe('unknown');
    });

    it('leaves out an attempt whose publisher never spoke about the axes', async () => {
      // `null` on both is an event from before the axes existed; an empty derivation is a
      // finding and lands in `unknown`. Folding the first one in under any label would
      // invent information.
      const prisma = fakePrisma();

      await projectorOver(prisma).apply(attempt({ skills: null, focus: null }), AT);

      expect(prisma.rows).toHaveLength(0);
    });
  });

  describe('what a cell absorbs', () => {
    it('weighs a picked answer below a typed one', async () => {
      const typed = fakePrisma();
      const picked = fakePrisma();

      await projectorOver(typed).apply(attempt(), AT);
      await projectorOver(picked).apply(
        attempt({ answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: false } }),
        AT,
      );

      expect(typed.rows[0]?.weightedSample).toBeCloseTo(1);
      expect(picked.rows[0]?.weightedSample).toBeCloseTo(2 / 3);
      // Both still count as one attempt: the form changes what an attempt proves, not
      // whether it happened.
      expect(picked.rows[0]?.attempts).toBe(1);
    });

    it('charges each gap its share of the time rather than the whole exercise', async () => {
      const prisma = fakePrisma();

      await projectorOver(prisma).apply(
        attempt({ timeSpentSeconds: 60, gapCount: 5, gapPosition: 1 }),
        AT,
      );

      expect(prisma.rows[0]?.medianSecondsPerItem).toBe(12);
    });

    it('records a course-less attempt without inventing a course for it', async () => {
      const prisma = fakePrisma();

      await projectorOver(prisma).apply(attempt({ containerId: null }), AT);

      expect(prisma.rows[0]?.courseId).toBeNull();
    });
  });
});
