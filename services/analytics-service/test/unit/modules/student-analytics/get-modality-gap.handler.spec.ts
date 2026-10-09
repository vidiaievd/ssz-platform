import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetModalityGapHandler } = await import(
  '../../../../src/modules/student-analytics/queries/get-modality-gap.handler.js'
);
const { GetModalityGapQuery } = await import(
  '../../../../src/modules/student-analytics/queries/student-analytics.queries.js'
);

const STUDENT = 'student-1';
const VIEWER = 'teacher-1';

interface Row {
  atomType?: string;
  atomId: string;
  role?: string | null;
  contentType?: string;
  modality: string | null;
  passed?: boolean | null;
  score?: number;
  stabilityAfter?: number | null;
  occurredAt?: Date;
  containerId?: string | null;
}

function handlerFor(rows: Row[], names: Record<string, string> = {}, reachable = true) {
  const prisma = {
    atomEvidence: {
      findMany: ({ where }: { where: { containerId?: string } }) =>
        Promise.resolve(
          rows
            .filter(
              (row) => where.containerId === undefined || row.containerId === where.containerId,
            )
            .map((row) => ({
              atomType: row.atomType ?? 'vocabulary_item',
              atomId: row.atomId,
              role: row.role ?? 'focus',
              contentType: row.contentType ?? 'EXERCISE',
              modality: row.modality,
              passed: row.passed ?? null,
              score: row.score ?? 100,
              stabilityAfter: row.stabilityAfter ?? null,
              occurredAt: row.occurredAt ?? new Date('2026-09-01T00:00:00Z'),
            })),
        ),
    },
  };

  const content = {
    describeAtoms: (refs: ReadonlyArray<{ atomType: string; atomId: string }>) =>
      Promise.resolve(
        reachable
          ? new Map(
              refs
                .filter((ref) => names[ref.atomId] !== undefined)
                .map((ref) => [
                  `${ref.atomType}:${ref.atomId}`,
                  {
                    atomType: ref.atomType,
                    atomId: ref.atomId,
                    title: names[ref.atomId] as string,
                    track: 'lexis',
                    parentId: null,
                  },
                ]),
            )
          : new Map(),
      ),
  };

  const access = { assertMayRead: () => Promise.resolve() };

  return new (GetModalityGapHandler as never as new (
    access: unknown,
    prisma: unknown,
    content: unknown,
  ) => {
    execute: (query: unknown) => Promise<Record<string, never>>;
  })(access, prisma, content) as unknown as {
    execute: (query: unknown) => Promise<{
      gaps: Array<Record<string, never>>;
      summary: Record<string, never>;
      namesAvailable: boolean;
    }>;
  };
}

/** `n` observations of one atom in one modality, all right or all wrong. */
function runOf(atomId: string, modality: string | null, n: number, passed: boolean, extra: Partial<Row> = {}): Row[] {
  return Array.from({ length: n }, () => ({ atomId, modality, passed, ...extra }));
}

function query(courseId: string | null = null, limit = 25) {
  return new (GetModalityGapQuery as never as new (
    a: string,
    b: string,
    c: string | null,
    d: number,
  ) => unknown)(STUDENT, VIEWER, courseId, limit);
}

describe('GetModalityGapHandler (plan 63 §4.1)', () => {
  it('finds a word that is only ever recognised', async () => {
    const handler = handlerFor(runOf('w-1', 'recognition', 4, true), { 'w-1': 'stillingsannonse' });

    const result = (await handler.execute(query())) as never as {
      gaps: Array<{ verdict: string; title: string; gap: number | null; byModality: Record<string, { attempts: number; successRate: number | null }> }>;
      summary: { recognitionOnly: number; judged: number };
    };

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.verdict).toBe('recognition_only');
    expect(result.gaps[0]?.title).toBe('stillingsannonse');
    // Never asked for, so there is nothing to measure. A zero would say they produce it
    // as well as they recognise it.
    expect(result.gaps[0]?.gap).toBeNull();
    expect(result.gaps[0]?.byModality.production?.attempts).toBe(0);
    expect(result.gaps[0]?.byModality.production?.successRate).toBeNull();
    expect(result.summary.recognitionOnly).toBe(1);
  });

  it('does not judge a phonological contrast, which is only ever heard (plan 72)', async () => {
    const handler = handlerFor([
      ...runOf('nb:kjsj', 'recognition', 6, true, { atomType: 'phonological_contrast' }),
      ...runOf('w-1', 'recognition', 4, true),
    ]);

    const result = (await handler.execute(query())) as never as {
      gaps: Array<{ atomId: string }>;
      summary: { addressedAtoms: number; notCompared: number; recognitionOnly: number; byModality: Record<string, number> };
    };

    expect(result.gaps.map((g) => g.atomId)).toEqual(['w-1']);
    expect(result.summary.notCompared).toBe(1);
    expect(result.summary.recognitionOnly).toBe(1);
    // Still evidence about the learner: counted, just not judged.
    expect(result.summary.addressedAtoms).toBe(2);
    expect(result.summary.byModality.recognition).toBe(10);
  });

  it('measures the gap where production was attempted and went badly', async () => {
    const handler = handlerFor([
      ...runOf('w-1', 'recognition', 5, true),
      ...runOf('w-1', 'production', 4, false),
    ]);

    const result = (await handler.execute(query())) as never as {
      gaps: Array<{ verdict: string; gap: number }>;
      summary: { productionFailing: number };
    };

    expect(result.gaps[0]?.verdict).toBe('production_failing');
    expect(result.gaps[0]?.gap).toBeCloseTo(1);
    expect(result.summary.productionFailing).toBe(1);
  });

  it('says nothing about an atom with too little evidence', async () => {
    const handler = handlerFor(runOf('w-1', 'recognition', 2, true));

    const result = (await handler.execute(query())) as never as {
      gaps: unknown[];
      summary: { insufficient: number; judged: number };
    };

    expect(result.gaps).toHaveLength(0);
    expect(result.summary.insufficient).toBe(1);
    expect(result.summary.judged).toBe(0);
  });

  it('leaves an evenly known atom out of the findings and counts it', async () => {
    const handler = handlerFor([
      ...runOf('w-1', 'recognition', 3, true),
      ...runOf('w-1', 'production', 3, true),
    ]);

    const result = (await handler.execute(query())) as never as {
      gaps: unknown[];
      summary: { even: number; judged: number };
    };

    expect(result.gaps).toHaveLength(0);
    expect(result.summary.even).toBe(1);
    expect(result.summary.judged).toBe(1);
  });

  it('never judges on evidence from items that only required the atom', async () => {
    const handler = handlerFor(runOf('w-1', 'recognition', 5, true, { role: 'context' }));

    const result = (await handler.execute(query())) as never as {
      gaps: unknown[];
      summary: { observations: number; contextObservations: number; addressedAtoms: number };
    };

    expect(result.gaps).toHaveLength(0);
    expect(result.summary.observations).toBe(0);
    expect(result.summary.contextObservations).toBe(5);
    expect(result.summary.addressedAtoms).toBe(0);
  });

  it('keeps an unjudged modality out of every verdict', async () => {
    const handler = handlerFor([
      ...runOf('w-1', 'recognition', 4, true),
      ...runOf('w-1', null, 6, false),
    ]);

    const result = (await handler.execute(query())) as never as {
      gaps: Array<{ verdict: string }>;
      summary: { byModality: Record<string, number> };
    };

    expect(result.gaps[0]?.verdict).toBe('recognition_only');
    expect(result.summary.byModality.unknown).toBe(6);
  });

  it('prints every modality key, zeroes included', async () => {
    const handler = handlerFor(runOf('w-1', 'recognition', 3, true));

    const result = (await handler.execute(query())) as never as {
      summary: { byModality: Record<string, number> };
    };

    expect(result.summary.byModality).toEqual({
      recognition: 3,
      recall: 0,
      production: 0,
      unknown: 0,
    });
  });

  it('orders a measured gap ahead of one that was never asked for', async () => {
    const handler = handlerFor([
      ...runOf('w-1', 'recognition', 4, true),
      ...runOf('w-2', 'recognition', 5, true),
      ...runOf('w-2', 'production', 4, false),
    ]);

    const result = (await handler.execute(query())) as never as {
      gaps: Array<{ atomId: string; verdict: string }>;
    };

    expect(result.gaps.map((gap) => gap.atomId)).toEqual(['w-2', 'w-1']);
  });

  it('narrows to one course when asked', async () => {
    const handler = handlerFor([
      ...runOf('w-1', 'recognition', 4, true, { containerId: 'course-a' }),
      ...runOf('w-2', 'recognition', 4, true, { containerId: 'course-b' }),
    ]);

    const result = (await handler.execute(query('course-a'))) as never as {
      gaps: Array<{ atomId: string }>;
    };

    expect(result.gaps.map((gap) => gap.atomId)).toEqual(['w-1']);
  });

  it('keeps the findings when the names cannot be asked for', async () => {
    const handler = handlerFor(runOf('w-1', 'recognition', 4, true), {}, false);

    const result = (await handler.execute(query())) as never as {
      gaps: Array<{ title: string | null }>;
      namesAvailable: boolean;
    };

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.title).toBeNull();
    expect(result.namesAvailable).toBe(false);
  });

  it('counts the card side of the same answer apart, so nothing is counted twice', async () => {
    // One submission: the item is rated, then the word's own card is rated from it.
    const handler = handlerFor([
      ...runOf('w-1', 'recognition', 4, true),
      ...runOf('w-1', 'recognition', 4, true, { contentType: 'VOCABULARY_WORD' }),
    ]);

    const result = (await handler.execute(query())) as never as {
      gaps: Array<{ byModality: Record<string, { attempts: number }>; cardReviews: number }>;
      summary: { observations: number; cardReviews: number; byModality: Record<string, number> };
    };

    expect(result.gaps[0]?.byModality.recognition?.attempts).toBe(4);
    expect(result.gaps[0]?.cardReviews).toBe(4);
    expect(result.summary.observations).toBe(4);
    expect(result.summary.cardReviews).toBe(4);
    expect(result.summary.byModality.recognition).toBe(4);
  });

  it('reports the bars a verdict was made against', async () => {
    const handler = handlerFor(runOf('w-1', 'recognition', 3, true));

    const result = (await handler.execute(query())) as never as {
      minAttempts: number;
      thresholds: { strong: number; failing: number };
    };

    expect(result.minAttempts).toBe(3);
    expect(result.thresholds).toEqual({ strong: 0.8, failing: 0.6 });
  });
});
