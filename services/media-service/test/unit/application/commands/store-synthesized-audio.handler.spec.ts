import { FinalizeUploadCommand } from '../../../../src/modules/assets/application/commands/finalize-upload/finalize-upload.command.js';
import { StoreSynthesizedAudioCommand } from '../../../../src/modules/assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import { StoreSynthesizedAudioHandler } from '../../../../src/modules/assets/application/commands/store-synthesized-audio/store-synthesized-audio.handler.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const SIZE_LIMITS = { maxImageSizeBytes: 1e7, maxAudioSizeBytes: 1e8, maxVideoSizeBytes: 1e9 };
const SYNTHESIS = { provider: 'piper', voice: 'v', lang: 'nb', textHash: 'a'.repeat(64), segments: 3 };
const MP3 = Buffer.alloc(4096, 1);

function makeAsset(origin: 'UPLOAD' | 'SYNTHESIZED' = 'SYNTHESIZED') {
  return MediaAssetEntity.create({
    ownerId: 'owner-1',
    mimeType: 'audio/mpeg',
    sizeBytes: 1,
    originalFilename: 'narration.mp3',
    entityType: 'lesson_asset',
    sizeLimits: SIZE_LIMITS,
    origin,
  }).value;
}

function makeHandler(asset: MediaAssetEntity | null, finalize: Result<void, any> = Result.ok()) {
  const repo = {
    findByIdAndOwner: jest.fn().mockResolvedValue(asset),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const storage = { uploadObject: jest.fn().mockResolvedValue(undefined) };
  const commandBus = { execute: jest.fn().mockResolvedValue(finalize) };
  const handler = new StoreSynthesizedAudioHandler(repo as any, storage as any, commandBus as any);
  return { handler, repo, storage, commandBus };
}

const command = (asset: MediaAssetEntity, mimeType = 'audio/mpeg') =>
  new StoreSynthesizedAudioCommand(asset.id, 'owner-1', MP3, mimeType, SYNTHESIS);

describe('StoreSynthesizedAudioHandler', () => {
  it('stores the bytes, records synthesis and the real size, then finalizes', async () => {
    const asset = makeAsset();
    const { handler, repo, storage, commandBus } = makeHandler(asset);

    const result = await handler.execute(command(asset));

    expect(result.isOk).toBe(true);
    // lesson_asset lives in the private bucket.
    expect(storage.uploadObject).toHaveBeenCalledWith(asset.storageKey.value, MP3, 'audio/mpeg', false);
    expect(asset.synthesis).toEqual(SYNTHESIS);
    expect(asset.sizeBytes.value).toBe(BigInt(MP3.length));
    expect(repo.save).toHaveBeenCalledWith(asset);

    const finalize = commandBus.execute.mock.calls[0]![0];
    expect(finalize).toBeInstanceOf(FinalizeUploadCommand);
    expect(finalize).toMatchObject({ assetId: asset.id, ownerId: 'owner-1' });
    // Finalize reads the object back, so the bytes must be stored first.
    expect(storage.uploadObject.mock.invocationCallOrder[0]!).toBeLessThan(
      commandBus.execute.mock.invocationCallOrder[0]!,
    );
  });

  it('refuses an uploaded asset, which a person owns the bytes of', async () => {
    const asset = makeAsset('UPLOAD');
    const { handler, storage, commandBus } = makeHandler(asset);

    expect((await handler.execute(command(asset))).error).toBe('INVALID_STATUS_TRANSITION');
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('refuses a mime type other than the one requested', async () => {
    const asset = makeAsset();
    const { handler, storage } = makeHandler(asset);

    expect((await handler.execute(command(asset, 'audio/wav'))).error).toBe('MIME_TYPE_NOT_ALLOWED');
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('reports a missing asset and passes a finalize failure through', async () => {
    const asset = makeAsset();
    expect((await makeHandler(null).handler.execute(command(asset))).error).toBe('ASSET_NOT_FOUND');
    const failing = makeHandler(asset, Result.fail('FILE_NOT_FOUND_IN_STORAGE'));
    expect((await failing.handler.execute(command(asset))).error).toBe('FILE_NOT_FOUND_IN_STORAGE');
  });
});
