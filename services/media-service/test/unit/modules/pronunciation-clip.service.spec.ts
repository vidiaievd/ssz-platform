import { PronunciationClipService } from '../../../src/modules/pronunciation/pronunciation-clip.service.js';
import { FinalizeUploadCommand } from '../../../src/modules/assets/application/commands/finalize-upload/finalize-upload.command.js';
import { RequestUploadCommand } from '../../../src/modules/assets/application/commands/request-upload/request-upload.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

const MP3 = Buffer.from('mp3-bytes');

function makeService(opts?: { bytes?: Result<Buffer, any>; request?: Result<any, any>; finalize?: Result<any, any> }) {
  const pronunciation = {
    getOrCreateBytes: jest.fn().mockResolvedValue(opts?.bytes ?? Result.ok(MP3)),
    voiceName: 'no_NO-talesyntese-medium',
  };
  const commandBus = {
    execute: jest.fn().mockImplementation(async (command: unknown) => {
      if (command instanceof RequestUploadCommand) {
        return opts?.request ?? Result.ok({ assetId: 'asset-1', storageKey: 'owner/asset-1.mp3', uploadUrl: 'u', expiresAt: new Date() });
      }
      return opts?.finalize ?? Result.ok();
    }),
  };
  const storage = { uploadObject: jest.fn().mockResolvedValue(undefined) };
  const service = new PronunciationClipService(pronunciation as any, commandBus as any, storage as any);
  return { service, pronunciation, commandBus, storage };
}

describe('PronunciationClipService', () => {
  it('turns a synthesized word into a private exercise asset of the caller', async () => {
    const { service, commandBus, storage } = makeService();

    const result = await service.createAsset('teacher-1', 'kjenne', 'nb', 'ex-1');

    expect(result.value).toEqual({ assetId: 'asset-1', voice: 'no_NO-talesyntese-medium' });

    const request = commandBus.execute.mock.calls[0]![0] as RequestUploadCommand;
    expect(request).toMatchObject({
      ownerId: 'teacher-1',
      mimeType: 'audio/mpeg',
      sizeBytes: BigInt(MP3.length),
      entityType: 'exercise_asset',
      entityId: 'ex-1',
    });
    // Private bucket: only the profile avatar lives in the public one.
    expect(storage.uploadObject).toHaveBeenCalledWith('owner/asset-1.mp3', MP3, 'audio/mpeg', false);

    // Finalize is what measures and converts it — and it runs after the bytes are stored.
    const finalize = commandBus.execute.mock.calls[1]![0] as FinalizeUploadCommand;
    expect(finalize).toBeInstanceOf(FinalizeUploadCommand);
    expect(finalize).toMatchObject({ assetId: 'asset-1', ownerId: 'teacher-1' });
    expect(storage.uploadObject.mock.invocationCallOrder[0]!).toBeLessThan(
      commandBus.execute.mock.invocationCallOrder[1]!,
    );
  });

  it('creates nothing when synthesis fails', async () => {
    const { service, commandBus, storage } = makeService({ bytes: Result.fail('SYNTHESIS_FAILED') });

    const result = await service.createAsset('teacher-1', 'kjenne', 'nb', null);

    expect(result.error).toBe('SYNTHESIS_FAILED');
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('reports a refused request or finalize as ASSET_REJECTED', async () => {
    const refusedRequest = makeService({ request: Result.fail('MIME_TYPE_NOT_ALLOWED') });
    expect((await refusedRequest.service.createAsset('t', 'kjenne', 'nb', null)).error).toBe('ASSET_REJECTED');
    expect(refusedRequest.storage.uploadObject).not.toHaveBeenCalled();

    const refusedFinalize = makeService({ finalize: Result.fail('FILE_NOT_FOUND_IN_STORAGE') });
    expect((await refusedFinalize.service.createAsset('t', 'kjenne', 'nb', null)).error).toBe('ASSET_REJECTED');
  });
});
