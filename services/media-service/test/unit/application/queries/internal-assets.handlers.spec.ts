import { DescribeAssetsHandler } from '../../../../src/modules/assets/application/queries/describe-assets/describe-assets.handler.js';
import { DescribeAssetsQuery } from '../../../../src/modules/assets/application/queries/describe-assets/describe-assets.query.js';
import { GetPlaybackHandler } from '../../../../src/modules/assets/application/queries/get-playback/get-playback.handler.js';
import { GetPlaybackQuery } from '../../../../src/modules/assets/application/queries/get-playback/get-playback.query.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';

const SIZE_LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
};

function recording(stage: 'pending' | 'uploaded' | 'ready' | 'failed' | 'deleted') {
  const asset = MediaAssetEntity.create({
    ownerId: 'student-1',
    mimeType: 'audio/webm;codecs=opus',
    sizeBytes: 150_000,
    entityType: 'submission_recording',
    entityId: 'attempt-1',
    sizeLimits: SIZE_LIMITS,
  }).value;
  if (stage === 'pending') return asset;
  if (stage === 'failed') {
    asset.markFailed();
    return asset;
  }
  asset.recordDuration(12_400);
  asset.markUploaded();
  if (stage === 'uploaded') return asset;
  asset.startProcessing();
  asset.attachWaveform([0.2, 1], 12_350);
  asset.markReady([]);
  if (stage === 'deleted') asset.softDelete();
  return asset;
}

function repoWith(assets: MediaAssetEntity[]) {
  return {
    findByIds: jest.fn().mockImplementation(async (ids: string[]) => assets.filter((a) => ids.includes(a.id))),
  };
}

describe('DescribeAssetsHandler', () => {
  it('describes known assets and leaves unknown ids out', async () => {
    const ready = recording('ready');
    const failed = recording('failed');
    const repo = repoWith([ready, failed]);
    const handler = new DescribeAssetsHandler(repo as any);

    const out = await handler.execute(new DescribeAssetsQuery([ready.id, failed.id, 'missing', ready.id]));

    expect(repo.findByIds).toHaveBeenCalledWith([ready.id, failed.id, 'missing']);
    expect(out).toEqual([
      {
        id: ready.id,
        ownerId: 'student-1',
        entityType: 'submission_recording',
        entityId: 'attempt-1',
        status: 'READY',
        mimeType: 'audio/webm',
        sizeBytes: 150_000,
        durationMs: 12_400,
      },
      expect.objectContaining({ id: failed.id, status: 'FAILED', durationMs: null }),
    ]);
  });
});

describe('GetPlaybackHandler', () => {
  function makeHandler(assets: MediaAssetEntity[], variants: unknown[] = []) {
    const storage = {
      generatePresignedDownloadUrl: jest.fn().mockImplementation(async (key: string) => `https://minio/${key}`),
      getPublicUrl: jest.fn(),
    };
    const prisma = { assetVariant: { findMany: jest.fn().mockResolvedValue(variants) } };
    const config = { get: jest.fn().mockReturnValue({ presignedDownloadTtlSeconds: 3600 }) };
    const handler = new GetPlaybackHandler(repoWith(assets) as any, storage as any, prisma as any, config as any);
    return { handler, storage, prisma };
  }

  it('serves the mp3 variant with duration and peaks', async () => {
    const asset = recording('ready');
    const { handler, prisma } = makeHandler(
      [asset],
      [{ assetId: asset.id, variantType: 'mp3', storageKey: 'k/variants/mp3.mp3', mimeType: 'audio/mpeg' }],
    );

    const [out] = await handler.execute(new GetPlaybackQuery([asset.id]));

    expect(prisma.assetVariant.findMany).toHaveBeenCalledWith({
      where: { assetId: { in: [asset.id] }, variantType: 'mp3' },
    });
    expect(out).toEqual({
      id: asset.id,
      url: 'https://minio/k/variants/mp3.mp3',
      mimeType: 'audio/mpeg',
      expiresAt: expect.any(String),
      durationMs: 12_400,
      peaks: [0.2, 1],
    });
  });

  it('falls back to the original before processing is done', async () => {
    const asset = recording('uploaded');
    const { handler } = makeHandler([asset]);

    const [out] = await handler.execute(new GetPlaybackQuery([asset.id]));

    expect(out!.url).toBe(`https://minio/${asset.storageKey.value}`);
    expect(out!.mimeType).toBe('audio/webm');
    expect(out!.peaks).toBeNull();
  });

  it('leaves out assets whose bytes are not in storage', async () => {
    const assets = [recording('pending'), recording('failed'), recording('deleted')];
    const { handler, prisma } = makeHandler(assets);

    const out = await handler.execute(new GetPlaybackQuery(assets.map((a) => a.id)));

    expect(out).toEqual([]);
    expect(prisma.assetVariant.findMany).not.toHaveBeenCalled();
  });
});
