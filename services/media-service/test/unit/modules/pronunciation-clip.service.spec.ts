import { PronunciationClipService } from '../../../src/modules/pronunciation/pronunciation-clip.service.js';
import { RequestUploadCommand } from '../../../src/modules/assets/application/commands/request-upload/request-upload.command.js';
import { StoreSynthesizedAudioCommand } from '../../../src/modules/assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import { Result } from '../../../src/shared/kernel/result.js';
import { readWordAnswer } from '../../../src/infrastructure/tts/http-reference-synthesizer.js';
import { buildWav, silence } from '../../../src/infrastructure/audio/wav.js';

jest.mock('../../../src/infrastructure/audio/mp3-encoder.js', () => ({
  encodeMp3: jest.fn(async (wav: Buffer) => Buffer.concat([Buffer.from('mp3:'), wav])),
}));

const MP3 = Buffer.from('mp3-bytes');

const AZURE = { sampleRate: 16_000, channels: 1, bitsPerSample: 16 };
/** A word as Azure gives it: 200 ms before, 300 ms of sound, 1.3 s of padding after. */
const SOUND = Buffer.alloc(16 * 300 * 2, 0x40);
const WAV = buildWav({ ...AZURE, data: Buffer.concat([silence(200, AZURE), SOUND, silence(1300, AZURE)]) });
/** The same word cut to 100 ms lead + sound + 150 ms tail. */
const TRIMMED = buildWav({ ...AZURE, data: Buffer.concat([silence(100, AZURE), SOUND, silence(150, AZURE)]) });

function makeService(opts?: {
  bytes?: Result<Buffer, any>;
  request?: Result<any, any>;
  store?: Result<any, any>;
  word?: (...args: any[]) => Promise<unknown>;
}) {
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
  const cloud = {
    provider: 'ai-service',
    reference: jest.fn(),
    wordAlone: jest.fn(
      opts?.word ??
        (async (_w: string, _l: string, voice: string) => ({
          status: 'ok',
          clip: { wav: WAV, audioMs: 640, voice, accuracy: 98 },
        })),
    ),
  };
  const service = new PronunciationClipService(pronunciation as any, commandBus as any, cloud as any);
  return { service, pronunciation, commandBus, cloud };
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

  describe('with a named cloud voice (plan 86, step 4z.3)', () => {
    it("asks ai-service for the word alone and stores it as mp3, piper untouched", async () => {
      const { service, commandBus, cloud, pronunciation } = makeService();

      const result = await service.createAsset('teacher-1', ' kjære ', 'nb', 'ex-1', 'nb-NO-FinnNeural');

      expect(result.value).toEqual({ assetId: 'asset-1', voice: 'nb-NO-FinnNeural' });
      expect(cloud.wordAlone).toHaveBeenCalledWith('kjære', 'nb', 'nb-NO-FinnNeural');
      expect(pronunciation.getOrCreateBytes).not.toHaveBeenCalled();
      // Azure's padding is cut before encoding (plan 86, step 4z.6).
      const mp3 = Buffer.concat([Buffer.from('mp3:'), TRIMMED]);
      expect(commandBus.execute.mock.calls[0]![0]).toMatchObject({ mimeType: 'audio/mpeg', sizeBytes: BigInt(mp3.length) });
      const store = commandBus.execute.mock.calls[1]![0] as StoreSynthesizedAudioCommand;
      expect(store).toMatchObject({ audio: mp3, mimeType: 'audio/mpeg' });
      expect(store.synthesis).toMatchObject({ provider: 'ai-service', voice: 'nb-NO-FinnNeural', lang: 'nb' });
    });

    it.each([
      [{ status: 'refused', reason: 'not_a_word' }, 'NOT_A_WORD'],
      [{ status: 'refused', reason: 'not_available' }, 'NOT_AVAILABLE'],
      [{ status: 'rejected', voice: 'nb-NO-FinnNeural', accuracy: 40 }, 'REFERENCE_REJECTED'],
    ])('creates nothing on %j — %s', async (answer, code) => {
      const { service, commandBus } = makeService({ word: async () => answer });
      expect((await service.createAsset('t', 'kjære', 'nb', null, 'nb-NO-FinnNeural')).error).toBe(code);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('is SYNTHESIS_FAILED when ai-service does not answer', async () => {
      const { service } = makeService({ word: async () => { throw new Error('ai-service responded 502'); } });
      expect((await service.createAsset('t', 'kjære', 'nb', null, 'nb-NO-FinnNeural')).error).toBe('SYNTHESIS_FAILED');
    });

    it("reads ai-service's answer: the clip from base64, failed as a throw", () => {
      const ok = readWordAnswer({
        status: 'ok',
        clip: { wav: WAV.toString('base64'), audioMs: 640, voice: 'nb-NO-FinnNeural', accuracy: 98 },
      });
      expect(ok).toEqual({ status: 'ok', clip: { wav: WAV, audioMs: 640, voice: 'nb-NO-FinnNeural', accuracy: 98 } });
      expect(readWordAnswer({ status: 'rejected', voice: 'v', accuracy: null })).toEqual({
        status: 'rejected',
        voice: 'v',
        accuracy: null,
      });
      expect(() => readWordAnswer({ status: 'failed', errorCode: 'provider_timeout' })).toThrow('provider_timeout');
    });
  });
});
