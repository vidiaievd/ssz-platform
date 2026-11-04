jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PrismaExerciseItemTargetRepository } from './prisma-exercise-item-target.repository.js';

// Plan 86, step 8.2: a sound target is described from the sound catalogue.

function makeRepository(sounds: unknown[] = []) {
  const prisma = {
    grammarRuleAtom: { findMany: jest.fn().mockResolvedValue([]) },
    vocabularyItem: { findMany: jest.fn().mockResolvedValue([]) },
    soundAtom: { findMany: jest.fn().mockResolvedValue(sounds) },
  };
  return { repository: new PrismaExerciseItemTargetRepository(prisma as any), prisma };
}

describe('PrismaExerciseItemTargetRepository.describeAtoms', () => {
  it('names a sound by its English title, with no track and no parent', async () => {
    const { repository, prisma } = makeRepository([
      { id: 'nb:kj', ipa: 'ç', texts: [{ title: 'kj sound' }] },
    ]);

    const atoms = await repository.describeAtoms([{ atomType: 'sound', atomId: 'nb:kj' }]);

    expect(prisma.soundAtom.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['nb:kj'] } });
    expect(prisma.grammarRuleAtom.findMany).not.toHaveBeenCalled();
    expect(atoms).toEqual([
      { atomType: 'sound', atomId: 'nb:kj', title: 'kj sound', track: null, parentId: null },
    ]);
  });

  it('falls back to the IPA for a sound with no English text', async () => {
    const { repository } = makeRepository([{ id: 'nb:r', ipa: 'ɾ', texts: [] }]);

    const [atom] = await repository.describeAtoms([{ atomType: 'sound', atomId: 'nb:r' }]);

    expect(atom?.title).toBe('ɾ');
  });

  it('leaves out a sound the catalogue does not have — the caller reports it as not found', async () => {
    const { repository } = makeRepository([]);

    expect(await repository.describeAtoms([{ atomType: 'sound', atomId: 'nb:xx' }])).toEqual([]);
  });

  it('does not read the sound catalogue when no sound is asked about', async () => {
    const { repository, prisma } = makeRepository();

    await repository.describeAtoms([{ atomType: 'vocabulary_item', atomId: 'w-1' }]);

    expect(prisma.soundAtom.findMany).not.toHaveBeenCalled();
  });
});
