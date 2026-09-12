import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetStudentGridHandler } = await import(
  '../../../../src/modules/student-analytics/queries/get-student-grid.handler.js'
);
const { GetStudentGridQuery } = await import(
  '../../../../src/modules/student-analytics/queries/student-analytics.queries.js'
);

const STUDENT = 'anna';
const VIEWER = 'teacher';
const COURSE = 'c1';

type Row = {
  skill: string;
  focus: string;
  successRateEwma: number;
  meanStability: number | null;
  attempts: number;
  weightedSample: number;
};

const row = (over: Partial<Row> = {}): Row => ({
  skill: 'reading',
  // Where nearly every attempt lands today: no ContentRelation rows are seeded, so the
  // subject of an attempt is usually underivable.
  focus: 'unknown',
  successRateEwma: 0.72,
  meanStability: 11.4,
  attempts: 20,
  weightedSample: 14,
  ...over,
});

interface Options {
  rows?: Row[];
  coverage?: unknown;
}

function handlerFor(options: Options = {}) {
  const prisma = { skillMastery: { findMany: async () => options.rows ?? [] } };
  const access = { assertMayRead: async () => undefined };
  const content = { getCoverage: async () => options.coverage ?? null };
  const config = { get: () => ({ minWeightedSample: 8 }) };

  return new GetStudentGridHandler(
    prisma as never,
    access as never,
    content as never,
    config as never,
  );
}

const query = new GetStudentGridQuery(STUDENT, VIEWER, COURSE);
const cellOf = <T extends { skill: string; focus: string }>(cells: T[], skill: string, focus: string) =>
  cells.find((cell) => cell.skill === skill && cell.focus === focus);

const coverage = (over: Record<string, unknown> = {}) => ({
  containerId: COURSE,
  available: true,
  total: 452,
  bySkill: { listening: 0, reading: 380, spoken: 0, written: 72 },
  byFocus: { vocabulary: 0, grammar: 0, orthography: 0, pragmatics: 0, unknown: 452 },
  emptySkills: ['listening', 'spoken'],
  ...over,
});

describe('a learner with nothing measured', () => {
  it('says so instead of drawing a grid of zeroes', async () => {
    const result = await handlerFor().execute(query);

    expect(result.nothingMeasured).toBe(true);
    expect(result.cells.every((cell) => cell.ewma === null)).toBe(true);
    expect(result.cells.every((cell) => cell.state === 'notStarted')).toBe(true);
  });

  it('still returns the whole grid — the shape of the emptiness is the screen', async () => {
    const result = await handlerFor().execute(query);

    // Four channels by five subjects, and every pair present.
    expect(result.cells).toHaveLength(20);
    expect(new Set(result.cells.map((cell) => cell.skill)).size).toBe(4);
    expect(new Set(result.cells.map((cell) => cell.focus)).size).toBe(5);
  });
});

describe('the kinds of emptiness', () => {
  it('tells "the course teaches none of this" from "the learner has not started"', async () => {
    const result = await handlerFor({
      rows: [row()],
      coverage: coverage(),
    }).execute(query);

    // A channel no exercise trains: the whole `listening` row, and it is a fact about
    // the course. So is a subject nothing trains — the four named ones, today.
    expect(cellOf(result.cells, 'listening', 'unknown')?.state).toBe('noContent');
    expect(cellOf(result.cells, 'reading', 'vocabulary')?.state).toBe('noContent');
    // Trained, attempted, judged.
    expect(cellOf(result.cells, 'reading', 'unknown')?.state).toBe('ok');
  });

  it('blames no course when content could not be asked', async () => {
    const result = await handlerFor({ rows: [row()], coverage: null }).execute(query);

    expect(result.coverageUnavailable).toBe(true);
    expect(result.cells.some((cell) => cell.state === 'noContent')).toBe(false);
  });

  it('claims nothing about a course with nothing published', async () => {
    const result = await handlerFor({
      rows: [row()],
      coverage: coverage({ available: false, total: 0, emptySkills: [] }),
    }).execute(query);

    expect(result.cells.some((cell) => cell.state === 'noContent')).toBe(false);
  });

  it('refuses a verdict under the threshold and reports the evidence it had', async () => {
    const result = await handlerFor({
      rows: [row({ attempts: 4, weightedSample: 3.5 })],
    }).execute(query);

    const cell = cellOf(result.cells, 'reading', 'unknown');
    expect(cell?.state).toBe('insufficient');
    expect(cell?.weightedSample).toBe(3.5);
    expect(result.minWeightedSample).toBe(8);
  });
});

describe('the measured cells', () => {
  it('keeps a measured zero as a zero, not as an absence', async () => {
    const result = await handlerFor({
      rows: [row({ successRateEwma: 0 })],
    }).execute(query);

    const cell = cellOf(result.cells, 'reading', 'unknown');
    expect(cell?.state).toBe('low');
    expect(cell?.ewma).toBe(0);
  });

  it('reports stability as the number behind the label, in whole percent for the rate', async () => {
    const result = await handlerFor({ rows: [row()] }).execute(query);

    const cell = cellOf(result.cells, 'reading', 'unknown');
    expect(cell?.ewma).toBe(72);
    expect(cell?.meanStability).toBe(11.4);
  });

  it('counts attempts that fell outside the grid instead of losing them', async () => {
    const result = await handlerFor({
      rows: [row(), row({ skill: 'unknown', attempts: 40 })],
    }).execute(query);

    expect(result.unclassifiedAttempts).toBe(40);
    expect(result.cells).toHaveLength(20);
  });
});
