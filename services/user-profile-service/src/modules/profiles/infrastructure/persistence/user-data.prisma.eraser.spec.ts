jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { UserDataPrismaEraser } from './user-data.prisma.eraser.js';

function setup(profileIds: string[]) {
  const calls: string[] = [];
  const del = (name: string, count = 0) =>
    jest.fn().mockImplementation(() => {
      calls.push(name);
      return Promise.resolve({ count });
    });
  const tx = {
    profile: {
      findMany: jest.fn().mockResolvedValue(profileIds.map((id) => ({ id }))),
      deleteMany: del('profile', profileIds.length),
      updateMany: del('profile.guardian'),
    },
    studentTargetLanguage: { deleteMany: del('studentTargetLanguage') },
    studentProfile: { deleteMany: del('studentProfile') },
    tutorTeachingLanguage: { deleteMany: del('tutorTeachingLanguage') },
    tutorProfile: { deleteMany: del('tutorProfile') },
    teachingLanguage: { deleteMany: del('teachingLanguage') },
    teachingProfile: { deleteMany: del('teachingProfile') },
    placementResult: { deleteMany: del('placementResult', 2) },
    userEmailIndex: { deleteMany: del('userEmailIndex', 1) },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { tx, calls, eraser: new UserDataPrismaEraser(prisma as never) };
}

describe('UserDataPrismaEraser', () => {
  it('deletes the profile after its children, then placement and the e-mail index', async () => {
    const { tx, calls, eraser } = setup(['p1']);

    const erased = await eraser.erase('u1');

    expect(erased).toEqual({ profiles: 1, placementResults: 2, emailIndex: 1 });
    // Soft-deleted rows are found too — no deletedAt filter.
    expect(tx.profile.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
    expect(calls.indexOf('profile')).toBeGreaterThan(calls.indexOf('studentProfile'));
    expect(calls.indexOf('profile')).toBeGreaterThan(calls.indexOf('tutorProfile'));
    expect(calls.indexOf('profile')).toBeGreaterThan(calls.indexOf('teachingProfile'));
    expect(tx.profile.deleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['p1'] } } });
    expect(tx.placementResult.deleteMany.mock.calls[0][0]).toEqual({ where: { userId: 'u1' } });
    expect(tx.userEmailIndex.deleteMany.mock.calls[0][0]).toEqual({ where: { userId: 'u1' } });
  });

  it('unlinks the accounts the user was guardian of', async () => {
    const { tx, eraser } = setup(['p1']);

    await eraser.erase('u1');

    expect(tx.profile.updateMany).toHaveBeenCalledWith({
      where: { guardianAccountId: 'u1' },
      data: { guardianAccountId: null },
    });
  });

  it('is a no-op on a replay', async () => {
    const { tx, eraser } = setup([]);
    tx.placementResult.deleteMany.mockResolvedValue({ count: 0 });
    tx.userEmailIndex.deleteMany.mockResolvedValue({ count: 0 });

    expect(await eraser.erase('u1')).toEqual({ profiles: 0, placementResults: 0, emailIndex: 0 });
    expect(tx.studentProfile.deleteMany).not.toHaveBeenCalled();
    expect(tx.profile.deleteMany).not.toHaveBeenCalled();
  });
});
