import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { Result } from '../../../src/shared/kernel/result.js';
import { ContentClientError } from '../../../src/shared/application/ports/content-client.port.js';
import {
  OrganizationClientError,
  type SchoolLifecycleStatus,
} from '../../../src/shared/application/ports/organization-client.port.js';
import { SchoolActivityGate } from '../../../src/modules/attempts/application/services/school-activity-gate.js';

// Plan 90, phase 5, step 7: a school that is not active takes no new attempts and no review.

const SCHOOL = 's1';

function setup(over: { owner?: string | null | Error; status?: SchoolLifecycleStatus | Error } = {}) {
  const content = {
    getExercisePlacement: jest.fn().mockImplementation(async () => {
      if (over.owner instanceof Error) return Result.fail(new ContentClientError(over.owner.message === '404' ? 404 : 500, over.owner.message));
      return Result.ok({ ownerSchoolId: over.owner === undefined ? SCHOOL : over.owner });
    }),
  };
  const organization = {
    getSchoolStatus: jest.fn().mockImplementation(async () => {
      if (over.status instanceof Error) {
        return Result.fail(new OrganizationClientError(over.status.message === '404' ? 404 : 500, over.status.message));
      }
      return Result.ok(over.status ?? 'active');
    }),
  };
  return { content, organization, gate: new SchoolActivityGate(content as never, organization as never) };
}

describe('SchoolActivityGate', () => {
  it.each<SchoolLifecycleStatus>(['suspended', 'closed', 'purged'])(
    'refuses work on an exercise of a %s school with 409 SCHOOL_NOT_ACTIVE',
    async (status) => {
      const { gate } = setup({ status });
      const err = await gate.assertExerciseOpen('ex1').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ code: 'SCHOOL_NOT_ACTIVE', schoolStatus: status });
    },
  );

  it('lets an exercise of an active school through', async () => {
    const { gate } = setup();
    await expect(gate.assertExerciseOpen('ex1')).resolves.toBeUndefined();
  });

  it('asks nobody about an exercise that belongs to no school (a public course, a probe)', async () => {
    const { gate, organization } = setup({ owner: null, status: 'closed' });
    await expect(gate.assertExerciseOpen('ex1')).resolves.toBeUndefined();
    expect(organization.getSchoolStatus).not.toHaveBeenCalled();
    await expect(setup({ owner: new Error('404') }).gate.assertExerciseOpen('ex1')).resolves.toBeUndefined();
  });

  it('fails open when a neighbour does not answer', async () => {
    await expect(setup({ owner: new Error('down') }).gate.assertExerciseOpen('ex1')).resolves.toBeUndefined();
    await expect(setup({ status: new Error('down') }).gate.assertExerciseOpen('ex1')).resolves.toBeUndefined();
    await expect(setup({ status: new Error('404') }).gate.assertSchoolOpen(SCHOOL)).resolves.toBeUndefined();
  });

  it('checks the school of a submission directly, and a missing one passes', async () => {
    const { gate, content } = setup({ status: 'suspended' });
    await expect(gate.assertSchoolOpen(SCHOOL)).rejects.toBeInstanceOf(ConflictException);
    await expect(gate.assertSchoolOpen(null)).resolves.toBeUndefined();
    expect(content.getExercisePlacement).not.toHaveBeenCalled();
  });

  it('keeps an answer for a short while, so the hot path asks once', async () => {
    const { gate, content, organization } = setup();
    await gate.assertExerciseOpen('ex1');
    await gate.assertExerciseOpen('ex1');
    expect(content.getExercisePlacement).toHaveBeenCalledTimes(1);
    expect(organization.getSchoolStatus).toHaveBeenCalledTimes(1);
  });
});
