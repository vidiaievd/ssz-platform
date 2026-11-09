import { EraseOwnerAssetsHandler } from '../../../../src/modules/assets/application/commands/erase-owner-assets/erase-owner-assets.handler.js';
import { EraseOwnerAssetsCommand } from '../../../../src/modules/assets/application/commands/erase-owner-assets/erase-owner-assets.command.js';
import type { IStorageService } from '../../../../src/shared/application/ports/storage.port.js';

// VoxOrd plan 07, step 3d.

const recording = {
  id: 'a-rec',
  storageKey: 'audio/rec.webm',
  entityType: 'attempt_recording',
  variants: [{ storageKey: 'audio/rec.wav' }, { storageKey: 'audio/rec.mp3' }],
};
const avatar = { id: 'a-ava', storageKey: 'img/ava.jpg', entityType: 'profile_avatar', variants: [] };

function makeHandler(assets: unknown[], failKey?: string) {
  const storage = {
    deleteObject: jest.fn((key: string) =>
      key === failKey ? Promise.reject(new Error('s3 down')) : Promise.resolve(),
    ),
  } as unknown as jest.Mocked<IStorageService>;
  const prisma = {
    mediaAsset: { findMany: jest.fn().mockResolvedValue(assets), deleteMany: jest.fn((a) => ({ op: 'assets', a })) },
    assetVariant: { deleteMany: jest.fn((a) => ({ op: 'variants', a })) },
    processingJob: { deleteMany: jest.fn((a) => ({ op: 'jobs', a })) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { storage, prisma, handler: new EraseOwnerAssetsHandler(storage, prisma as never) };
}

describe('EraseOwnerAssetsHandler', () => {
  it('deletes every object of every asset, then the rows children first', async () => {
    const { storage, prisma, handler } = makeHandler([recording, avatar]);

    const result = await handler.execute(new EraseOwnerAssetsCommand('u1'));

    expect(result).toEqual({ assets: 2, objects: 4 });
    // Soft-deleted assets too: no deletedAt filter.
    expect(prisma.mediaAsset.findMany.mock.calls[0][0].where).toEqual({ ownerId: 'u1' });
    expect(storage.deleteObject).toHaveBeenCalledWith('audio/rec.webm', false);
    expect(storage.deleteObject).toHaveBeenCalledWith('audio/rec.wav', false);
    expect(storage.deleteObject).toHaveBeenCalledWith('audio/rec.mp3', false);
    expect(storage.deleteObject).toHaveBeenCalledWith('img/ava.jpg', true);
    const ops = prisma.$transaction.mock.calls[0][0].map((o: { op: string }) => o.op);
    expect(ops).toEqual(['jobs', 'variants', 'assets']);
    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a-rec', 'a-ava'] } } });
  });

  it('keeps the row of an asset whose object failed, erases the rest and throws for the retry', async () => {
    const { prisma, handler } = makeHandler([recording, avatar], 'audio/rec.wav');

    await expect(handler.execute(new EraseOwnerAssetsCommand('u1'))).rejects.toThrow('1 asset(s)');

    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a-ava'] } } });
  });

  it('is a no-op on a replay', async () => {
    const { storage, prisma, handler } = makeHandler([]);

    expect(await handler.execute(new EraseOwnerAssetsCommand('u1'))).toEqual({ assets: 0, objects: 0 });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
