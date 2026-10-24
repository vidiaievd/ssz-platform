import { jest } from '@jest/globals';

// The reader pulls in `PrismaService`, whose generated client brings jest down on
// `import.meta` — mocked at the module level, as in the projector's spec.
jest.unstable_mockModule('../../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { MasteryProfileReader } = await import(
  '../../../../../src/modules/metrics/mastery/mastery-profile.reader.js'
);
const { MasteryController } = await import(
  '../../../../../src/modules/metrics/mastery/mastery.controller.js'
);
const { MyMasteryController } = await import(
  '../../../../../src/modules/metrics/mastery/my-mastery.controller.js'
);

const LEARNER = '5d0f6c2e-8f43-4a5e-9d55-0b1c2d3e4f50';

function row(skill: string, focus: string, successRateEwma: number, weightedSample: number) {
  return {
    userId: LEARNER,
    courseId: 'course-1',
    skill,
    focus,
    successRateEwma,
    meanStability: null,
    medianSecondsPerItem: null,
    attempts: Math.round(weightedSample),
    weightedSample,
    lastAttemptAt: new Date('2026-10-24T10:00:00Z'),
  };
}

function makeReader(rows: ReturnType<typeof row>[]) {
  const findMany = jest.fn((_args: unknown) => Promise.resolve(rows));
  const prisma = { skillMastery: { findMany } };
  const config = { get: () => ({ minWeightedSample: 8 }) };
  return { reader: new MasteryProfileReader(prisma as never, config as never), findMany };
}

describe('MasteryProfileReader', () => {
  it('judges cells over the bar, weakest first, and sets thin ones aside', async () => {
    const { reader } = makeReader([
      row('writing', 'grammar', 0.8, 12),
      row('reading', 'vocabulary', 0.4, 10),
      row('listening', 'vocabulary', 0.2, 3),
    ]);

    const profile = await reader.read(LEARNER);

    expect(profile).toMatchObject({ userId: LEARNER, courseId: null, minWeightedSample: 8 });
    expect(profile.weakest.map((c) => c.skill)).toEqual(['reading', 'writing']);
    expect(profile.insufficient).toEqual([
      expect.objectContaining({ skill: 'listening', status: 'insufficient_data', shortfall: 5 }),
    ]);
  });

  it('narrows to a course when asked, and to every cell when not', async () => {
    const { reader, findMany } = makeReader([]);

    await reader.read(LEARNER, 'course-1');
    await reader.read(LEARNER);

    expect(findMany.mock.calls[0]![0]).toEqual({ where: { userId: LEARNER, courseId: 'course-1' } });
    expect(findMany.mock.calls[1]![0]).toEqual({ where: { userId: LEARNER } });
  });

  it('cuts the verdicts to a positive limit and ignores any other', async () => {
    const rows = [row('writing', 'grammar', 0.8, 12), row('reading', 'vocabulary', 0.4, 10)];

    expect((await makeReader(rows).reader.read(LEARNER, undefined, '1')).weakest).toHaveLength(1);
    expect((await makeReader(rows).reader.read(LEARNER, undefined, '0')).weakest).toHaveLength(2);
    expect((await makeReader(rows).reader.read(LEARNER, undefined, 'x')).weakest).toHaveLength(2);
  });
});

describe('the two mastery routes', () => {
  const profile = { userId: LEARNER, courseId: null, minWeightedSample: 8, weakest: [], insufficient: [] };

  it('the learner’s route reads the token’s learner', async () => {
    const reader = { read: jest.fn(() => Promise.resolve(profile)) };
    const controller = new MyMasteryController(reader as never);

    await controller.mine(
      { userId: LEARNER, roles: ['student'] } as never,
      'course-1',
      '3',
    );

    expect(reader.read).toHaveBeenCalledWith(LEARNER, 'course-1', '3');
  });

  it('the internal route reads the learner it is named', async () => {
    const reader = { read: jest.fn(() => Promise.resolve(profile)) };
    const controller = new MasteryController(reader as never);

    await controller.forUser('someone', undefined, undefined);

    expect(reader.read).toHaveBeenCalledWith('someone', undefined, undefined);
  });
});
