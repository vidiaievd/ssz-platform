import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));
jest.unstable_mockModule('../../../../src/infrastructure/http/exercise-engine.client.js', () => ({
  ExerciseEngineClient: class {},
}));

const { GetKpisHandler } = await import('../../../../src/modules/school-analytics/queries/get-kpis.handler.js');
const { GetKpisQuery } = await import('../../../../src/modules/school-analytics/queries/get-kpis.query.js');

function makeHandler(role: string) {
  const prisma = {
    schoolMembership: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ schoolId: 's-1', userId: 'u-1', role }),
    },
    enrollmentProjection: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
  };
  const config = { get: () => ({ atRiskThresholdDays: 7 }) };
  return new GetKpisHandler(prisma as never, config as never, {} as never);
}

describe('GetKpisHandler — a school without enrolments', () => {
  it('sends the hint numbers, so the client can word the hint in its own language', async () => {
    const res = await makeHandler('OWNER').execute(new GetKpisQuery('s-1', 'u-1'));
    const byKey = Object.fromEntries(res.kpis.map((k) => [k.key, k]));

    expect(byKey.active_students_7d.hintValues).toEqual({ enrolled: 0 });
    expect(byKey.lessons_completed_7d.hintValues).toEqual({ courses: 0 });
    expect(byKey.at_risk.hintValues).toEqual({ days: 7 });
  });

  it('leaves at-risk out for a teacher', async () => {
    const res = await makeHandler('TEACHER').execute(new GetKpisQuery('s-1', 'u-1'));
    expect(res.kpis.map((k) => k.key)).not.toContain('at_risk');
  });
});
