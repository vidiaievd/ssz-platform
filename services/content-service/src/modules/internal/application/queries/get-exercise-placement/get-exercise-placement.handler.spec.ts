jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import { GetExercisePlacementHandler } from './get-exercise-placement.handler.js';
import { GetExercisePlacementQuery } from './get-exercise-placement.query.js';

const EXERCISE_ID = 'exercise-1';
const MODULE_ID = 'module-1';
const COURSE_ID = 'course-1';
const SCHOOL_ID = 'school-1';

interface ContainerRow {
  id: string;
  title: string;
  containerType: 'COURSE' | 'MODULE' | 'COLLECTION';
  ownerSchoolId: string | null;
}

function makePrismaStub(overrides: Partial<Record<string, unknown>> = {}) {
  const containers: Record<string, ContainerRow> = {
    [MODULE_ID]: {
      id: MODULE_ID,
      title: 'Leksjon 7 · I går',
      containerType: 'MODULE',
      ownerSchoolId: SCHOOL_ID,
    },
    [COURSE_ID]: {
      id: COURSE_ID,
      title: 'Ny i Norge A2',
      containerType: 'COURSE',
      ownerSchoolId: SCHOOL_ID,
    },
  };

  // itemType=EXERCISE placement lives directly under the module; itemType=CONTAINER
  // placement of the module lives under the course. No further parent for the course.
  const containerItemFindFirst = jest.fn(
    ({ where }: { where: { itemType: string; itemId: string } }) => {
      if (where.itemType === 'EXERCISE' && where.itemId === EXERCISE_ID) {
        return Promise.resolve({ containerVersion: { containerId: MODULE_ID } });
      }
      if (where.itemType === 'CONTAINER' && where.itemId === MODULE_ID) {
        return Promise.resolve({ containerVersion: { containerId: COURSE_ID } });
      }
      return Promise.resolve(null);
    },
  );

  return {
    exercise: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ template: { name: 'Perfektum — uregelrette verb' } }),
    },
    containerItem: { findFirst: containerItemFindFirst },
    container: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(containers[where.id] ?? null),
      ),
    },
    ...overrides,
  };
}

describe('GetExercisePlacementHandler', () => {
  it('climbs from an exercise placed in a module up to its course', async () => {
    const prisma = makePrismaStub();
    const handler = new GetExercisePlacementHandler(prisma as never);

    const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

    expect(result).toEqual({
      containerId: COURSE_ID,
      containerTitle: 'Ny i Norge A2',
      moduleId: MODULE_ID,
      moduleTitle: 'Leksjon 7 · I går',
      exerciseTitle: 'Perfektum — uregelrette verb',
      ownerSchoolId: SCHOOL_ID,
    });
  });

  it('leaves moduleId/moduleTitle null when the exercise sits directly under a course', async () => {
    const prisma = makePrismaStub({
      containerItem: {
        findFirst: jest.fn(({ where }: { where: { itemType: string; itemId: string } }) => {
          if (where.itemType === 'EXERCISE' && where.itemId === EXERCISE_ID) {
            return Promise.resolve({ containerVersion: { containerId: COURSE_ID } });
          }
          return Promise.resolve(null);
        }),
      },
    });
    const handler = new GetExercisePlacementHandler(prisma as never);

    const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

    expect(result.moduleId).toBeNull();
    expect(result.moduleTitle).toBeNull();
    expect(result.containerId).toBe(COURSE_ID);
  });

  it('throws NotFoundException when the exercise does not exist', async () => {
    const prisma = makePrismaStub({ exercise: { findUnique: jest.fn().mockResolvedValue(null) } });
    const handler = new GetExercisePlacementHandler(prisma as never);

    await expect(handler.execute(new GetExercisePlacementQuery('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the exercise is not placed in any container', async () => {
    const prisma = makePrismaStub({
      containerItem: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const handler = new GetExercisePlacementHandler(prisma as never);

    await expect(handler.execute(new GetExercisePlacementQuery(EXERCISE_ID))).rejects.toThrow(
      NotFoundException,
    );
  });
});
