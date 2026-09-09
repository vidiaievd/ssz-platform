jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import { GetExercisePlacementHandler } from './get-exercise-placement.handler.js';
import { GetExercisePlacementQuery } from './get-exercise-placement.query.js';

const EXERCISE_ID = 'exercise-1';
const MODULE_ID = 'module-1';
const ORPHAN_MODULE_ID = 'module-orphan';
const COURSE_ID = 'course-1';
const SCHOOL_ID = 'school-1';

const INSTRUCTION = 'Выберите правильный союз: «da» или «når».';

interface ContainerRow {
  id: string;
  title: string;
  containerType: 'COURSE' | 'MODULE' | 'COLLECTION';
  ownerSchoolId: string | null;
}

const CONTAINERS: Record<string, ContainerRow> = {
  [MODULE_ID]: {
    id: MODULE_ID,
    title: 'Leksjon 7 · I går',
    containerType: 'MODULE',
    ownerSchoolId: SCHOOL_ID,
  },
  [ORPHAN_MODULE_ID]: {
    id: ORPHAN_MODULE_ID,
    title: 'Leksjon 7 (gammel)',
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

/**
 * @param placedIn containers holding the exercise, oldest placement first.
 * @param parentOf who holds whom — anything absent is a container nothing holds.
 */
function makePrismaStub(
  {
    placedIn = [MODULE_ID],
    parentOf = { [MODULE_ID]: COURSE_ID },
    instructions = [{ instructionText: INSTRUCTION, draftInstructionText: null }],
  }: {
    placedIn?: string[];
    parentOf?: Record<string, string>;
    instructions?: { instructionText: string | null; draftInstructionText: string | null }[];
  } = {},
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    exercise: {
      findUnique: jest.fn().mockResolvedValue({
        template: { name: 'Multiple Choice' },
        instructions,
      }),
    },
    containerItem: {
      findMany: jest.fn(() =>
        Promise.resolve(
          placedIn.map((containerId) => ({ containerVersion: { containerId } })),
        ),
      ),
      findFirst: jest.fn(({ where }: { where: { itemType: string; itemId: string } }) => {
        const parent = parentOf[where.itemId];
        return Promise.resolve(
          where.itemType === 'CONTAINER' && parent
            ? { containerVersion: { containerId: parent } }
            : null,
        );
      }),
    },
    container: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(CONTAINERS[where.id] ?? null),
      ),
    },
    ...overrides,
  };
}

describe('GetExercisePlacementHandler', () => {
  it('climbs from an exercise placed in a module up to its course', async () => {
    const handler = new GetExercisePlacementHandler(makePrismaStub() as never);

    const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

    expect(result).toEqual({
      containerId: COURSE_ID,
      containerTitle: 'Ny i Norge A2',
      moduleId: MODULE_ID,
      moduleTitle: 'Leksjon 7 · I går',
      exerciseTitle: INSTRUCTION,
      ownerSchoolId: SCHOOL_ID,
    });
  });

  /**
   * Restructuring a course leaves the old module behind, still holding its exercises.
   * The older placement must not win, or every submission is filed under a module the
   * school stopped teaching.
   */
  it('prefers the placement that reaches a course over an older orphaned one', async () => {
    const handler = new GetExercisePlacementHandler(
      makePrismaStub({
        placedIn: [ORPHAN_MODULE_ID, MODULE_ID],
        parentOf: { [MODULE_ID]: COURSE_ID },
      }) as never,
    );

    const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

    expect(result.containerId).toBe(COURSE_ID);
    expect(result.moduleId).toBe(MODULE_ID);
  });

  /** Nothing reaches a course: the oldest placement is still a better answer than none. */
  it('falls back to the first placement when no chain reaches a course', async () => {
    const handler = new GetExercisePlacementHandler(
      makePrismaStub({ placedIn: [ORPHAN_MODULE_ID], parentOf: {} }) as never,
    );

    const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

    expect(result.containerId).toBe(ORPHAN_MODULE_ID);
    expect(result.moduleId).toBe(ORPHAN_MODULE_ID);
  });

  it('leaves moduleId/moduleTitle null when the exercise sits directly under a course', async () => {
    const handler = new GetExercisePlacementHandler(
      makePrismaStub({ placedIn: [COURSE_ID], parentOf: {} }) as never,
    );

    const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

    expect(result.moduleId).toBeNull();
    expect(result.moduleTitle).toBeNull();
    expect(result.containerId).toBe(COURSE_ID);
  });

  describe('exerciseTitle', () => {
    /** Every translate exercise shares one template name; the instruction is this one's. */
    it('names the exercise by its instruction rather than by its template', async () => {
      const handler = new GetExercisePlacementHandler(makePrismaStub() as never);

      const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

      expect(result.exerciseTitle).toBe(INSTRUCTION);
    });

    it('takes the first line and shortens a long instruction', async () => {
      const handler = new GetExercisePlacementHandler(
        makePrismaStub({
          instructions: [
            { instructionText: `${'Oversett setningene '.repeat(9)}\nAndre linje`, draftInstructionText: null },
          ],
        }) as never,
      );

      const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

      expect(result.exerciseTitle).toHaveLength(120);
      expect(result.exerciseTitle?.endsWith('…')).toBe(true);
      expect(result.exerciseTitle).not.toContain('Andre linje');
    });

    it('reads an unreleased instruction when there is no released one', async () => {
      const handler = new GetExercisePlacementHandler(
        makePrismaStub({
          instructions: [{ instructionText: '', draftInstructionText: 'Skriv om setningene.' }],
        }) as never,
      );

      const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

      expect(result.exerciseTitle).toBe('Skriv om setningene.');
    });

    it('falls back to the template name for an exercise with no instruction', async () => {
      const handler = new GetExercisePlacementHandler(
        makePrismaStub({ instructions: [] }) as never,
      );

      const result = await handler.execute(new GetExercisePlacementQuery(EXERCISE_ID));

      expect(result.exerciseTitle).toBe('Multiple Choice');
    });
  });

  it('throws NotFoundException when the exercise does not exist', async () => {
    const handler = new GetExercisePlacementHandler(
      makePrismaStub({}, { exercise: { findUnique: jest.fn().mockResolvedValue(null) } }) as never,
    );

    await expect(handler.execute(new GetExercisePlacementQuery('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the exercise is not placed in any container', async () => {
    const handler = new GetExercisePlacementHandler(
      makePrismaStub({ placedIn: [] }) as never,
    );

    await expect(handler.execute(new GetExercisePlacementQuery(EXERCISE_ID))).rejects.toThrow(
      NotFoundException,
    );
  });
});
