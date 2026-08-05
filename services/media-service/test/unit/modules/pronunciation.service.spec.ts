import { PronunciationService } from '../../../src/modules/pronunciation/pronunciation.service.js';
import type { IStorageService } from '../../../src/shared/application/ports/storage.port.js';

const TTS_CONFIG = {
  piperUrl: 'http://piper-tts:5000',
  piperVoice: 'no_NO-talesyntese-medium',
  piperTimeoutMs: 15_000,
  maxTextLength: 120,
};

function makeService(overrides?: Partial<jest.Mocked<IStorageService>>) {
  const storage: jest.Mocked<IStorageService> = {
    generatePresignedUploadUrl: jest.fn(),
    generatePresignedDownloadUrl: jest.fn(),
    getPublicUrl: jest.fn((key: string) => `http://minio/ssz-public/${key}`),
    objectExists: jest.fn().mockResolvedValue(false),
    getObjectMetadata: jest.fn(),
    deleteObject: jest.fn(),
    getObject: jest.fn(),
    uploadObject: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<IStorageService>;

  const config = { get: jest.fn().mockReturnValue(TTS_CONFIG) };
  const service = new PronunciationService(storage, config as any);

  // The wav→mp3 step shells out to ffmpeg; the unit under test is the caching
  // and keying logic around it.
  jest
    .spyOn(service as unknown as { toMp3: (b: Buffer) => Promise<Buffer> }, 'toMp3')
    .mockResolvedValue(Buffer.from('mp3-bytes'));

  return { service, storage };
}

function mockPiper(ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: async () => new TextEncoder().encode('wav-bytes').buffer,
  }) as unknown as typeof fetch;
}

describe('PronunciationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('synthesizes and stores a clip that does not exist yet', async () => {
    const { service, storage } = makeService();
    mockPiper();

    const result = await service.getOrCreate('sykepleier', 'nb');

    expect(result.isOk).toBe(true);
    expect(result.value.cached).toBe(false);
    expect(storage.uploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^tts\/no\/[0-9a-f]{64}\.mp3$/),
      expect.any(Buffer),
      'audio/mpeg',
      true,
    );
    expect(result.value.url).toContain('/ssz-public/tts/no/');
  });

  it('serves an existing clip without calling piper', async () => {
    const { service, storage } = makeService({ objectExists: jest.fn().mockResolvedValue(true) });
    mockPiper();

    const result = await service.getOrCreate('sykepleier', 'nb');

    expect(result.value.cached).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('keys the same word identically across the Norwegian tags', async () => {
    const { service, storage } = makeService();
    mockPiper();

    await service.getOrCreate('sykepleier', 'nb');
    await service.getOrCreate('sykepleier', 'no-NO');

    const [firstKey] = storage.uploadObject.mock.calls[0]!;
    const [secondKey] = storage.uploadObject.mock.calls[1]!;
    expect(firstKey).toBe(secondKey);
  });

  it('collapses concurrent requests for the same unheard word into one synthesis', async () => {
    const { service, storage } = makeService();
    mockPiper();

    const [a, b] = await Promise.all([
      service.getOrCreate('jobbe', 'nb'),
      service.getOrCreate('jobbe', 'nb'),
    ]);

    expect(a.isOk && b.isOk).toBe(true);
    expect(storage.uploadObject).toHaveBeenCalledTimes(1);
  });

  it('rejects empty text, over-long text and unsupported languages', async () => {
    const { service } = makeService();
    mockPiper();

    expect((await service.getOrCreate('   ', 'nb')).error).toBe('EMPTY_TEXT');
    expect((await service.getOrCreate('a'.repeat(121), 'nb')).error).toBe('TEXT_TOO_LONG');
    expect((await service.getOrCreate('hello', 'en')).error).toBe('LANGUAGE_NOT_SUPPORTED');
  });

  it('fails cleanly when piper is down', async () => {
    const { service, storage } = makeService();
    mockPiper(false);

    const result = await service.getOrCreate('sykepleier', 'nb');

    expect(result.isFail).toBe(true);
    expect(result.error).toBe('SYNTHESIS_FAILED');
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });
});
