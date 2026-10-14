import { PronunciationClipService } from '../../../src/modules/pronunciation/pronunciation-clip.service.js';
import { RequestUploadCommand } from '../../../src/modules/assets/application/commands/request-upload/request-upload.command.js';
import { StoreSynthesizedAudioCommand } from '../../../src/modules/assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

const MP3 = Buffer.from('mp3-bytes');

function makeService(opts?: { bytes?: Result<Buffer, any>; request?: Result<any, any>; store?: Result<any, any> }) {
  const pronunciation = {
    getOrCreateBytes: jest.fn().mockResolvedValue(opts?.bytes ?? Result.ok(MP3)),
    voiceName: jest.fn().mockReturnValue('no_NO-talesyntese-medium'),
    provider: 'piper',
  };
  const commandBus = {
    execute: jest.fn().mockImplementation(async (command: unknown) => {
      if (command instanceof RequestUploadCommand) {
        return opts?.request ?? Result.ok({ assetId: 'asset-1', storageKey: 'owner/asset-1.mp3', uploadUrl: 'u', expiresAt: new Date() });
      }
      return opts?.store ?? Result.ok();
    }),
  };
  const service = new PronunciationClipService(pronunciation as any, commandBus as any);
  return { service, pronunciation, commandBus };
}

describe('PronunciationClipService', () => {
  it('turns a synthesized word into a SYNTHESIZED exercise asset of the caller', async () => {
    const { service, commandBus } = makeService();

    const result = await service.createAsset('teacher-1', 'kjenne', 'nb', 'ex-1');

    expect(result.value).toEqual({ assetId: 'asset-1', voice: 'no_NO-talesyntese-medium' });

    const request = commandBus.execute.mock.calls[0]![0] as RequestUploadCommand;
    expect(request).toMatchObject({
      ownerId: 'teacher-1',
      mimeType: 'audio/mpeg',
      sizeBytes: BigInt(MP3.length),
      entityType: 'exercise_asset',
      entityId: 'ex-1',
      origin: 'SYNTHESIZED',
    });

    // Storing the bytes and finalizing them is one command (plan 74).
    const store = commandBus.execute.mock.calls[1]![0] as StoreSynthesizedAudioCommand;
    expect(store).toBeInstanceOf(StoreSynthesizedAudioCommand);
    expect(store).toMatchObject({ assetId: 'asset-1', ownerId: 'teacher-1', audio: MP3, mimeType: 'audio/mpeg' });
    expect(store.synthesis).toEqual({
      provider: 'piper',
      voice: 'no_NO-talesyntese-medium',
      lang: 'nb',
      textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      segments: 1,
    });
  });

  it('creates nothing when synthesis fails', async () => {
    const { service, commandBus } = makeService({ bytes: Result.fail('SYNTHESIS_FAILED') });

    const result = await service.createAsset('teacher-1', 'kjenne', 'nb', null);

    expect(result.error).toBe('SYNTHESIS_FAILED');
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('reports a refused request or store as ASSET_REJECTED', async () => {
    const refusedRequest = makeService({ request: Result.fail('MIME_TYPE_NOT_ALLOWED') });
    expect((await refusedRequest.service.createAsset('t', 'kjenne', 'nb', null)).error).toBe('ASSET_REJECTED');
    expect(refusedRequest.commandBus.execute).toHaveBeenCalledTimes(1);

    const refusedStore = makeService({ store: Result.fail('FILE_NOT_FOUND_IN_STORAGE') });
    expect((await refusedStore.service.createAsset('t', 'kjenne', 'nb', null)).error).toBe('ASSET_REJECTED');
  });
});
