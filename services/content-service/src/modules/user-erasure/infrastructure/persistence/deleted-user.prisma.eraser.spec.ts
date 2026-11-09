jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { DeletedUserPrismaEraser } from './deleted-user.prisma.eraser.js';

function setup(listIds: string[], authored = [0, 0, 0, 0, 0]) {
  const calls: string[] = [];
  const del = (name: string, count: number) =>
    jest.fn().mockImplementation(() => {
      calls.push(name);
      return Promise.resolve({ count });
    });
  const count = (n: number) => jest.fn().mockResolvedValue(n);
  const tx = {
    personalVocabularyEntry: { deleteMany: del('entries', 7) },
    personalVocabularyList: {
      findMany: jest.fn().mockResolvedValue(listIds.map((vocabularyListId) => ({ vocabularyListId }))),
    },
    vocabularyList: { deleteMany: del('lists', listIds.length), count: count(authored[2]) },
    contentEntitlement: { deleteMany: del('entitlements', 3) },
    contentShare: { deleteMany: del('shares', 1) },
    container: { count: count(authored[0]) },
    lesson: { count: count(authored[1]) },
    exercise: { count: count(authored[3]) },
    grammarRule: { count: count(authored[4]) },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { tx, calls, eraser: new DeletedUserPrismaEraser(prisma as never) };
}

describe('DeletedUserPrismaEraser', () => {
  it('deletes the words, the personal lists, entitlements and shares received', async () => {
    const { tx, calls, eraser } = setup(['l-nb', 'l-en']);

    const erased = await eraser.erase('u1');

    expect(erased).toEqual({
      words: 7,
      personalLists: 2,
      entitlements: 3,
      sharesReceived: 1,
      authoredLeft: 0,
    });
    expect(tx.personalVocabularyEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.vocabularyList.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['l-nb', 'l-en'] } } });
    // Entries before the lists: an entry on a catalogue item is not reached by the cascade.
    expect(calls.indexOf('entries')).toBeLessThan(calls.indexOf('lists'));
    // No revokedAt filter: revoked grants go too.
    expect(tx.contentEntitlement.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.contentShare.deleteMany).toHaveBeenCalledWith({ where: { sharedWithUserId: 'u1' } });
  });

  it('leaves authored content and reports it', async () => {
    const { tx, eraser } = setup([], [1, 0, 0, 2, 0]);

    const erased = await eraser.erase('u1');

    expect(erased.authoredLeft).toBe(3);
    expect(tx.exercise.count).toHaveBeenCalledWith({ where: { ownerUserId: 'u1', deletedAt: null } });
  });

  it('touches no list on a replay', async () => {
    const { tx, eraser } = setup([]);

    await eraser.erase('u1');

    expect(tx.vocabularyList.deleteMany).not.toHaveBeenCalled();
  });
});
