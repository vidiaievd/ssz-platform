import { SpeechVariantWriter } from '../../../../src/modules/assets/application/services/speech-variant-writer.js';
import { BackfillSpeechVariantsService } from '../../../../src/modules/assets/application/services/backfill-speech-variants.service.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';

const SIZE_LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
};

function readyRecording() {
  const asset = MediaAssetEntity.create({
    ownerId: 'student-1',
    mimeType: 'audio/webm;codecs=opus',
    sizeBytes: 150_000,
    entityType: 'submission_recording',
    entityId: 'attempt-1',
    sizeLimits: SIZE_LIMITS,
  }).value;
  asset.recordDuration(4_000);
  asset.markUploaded();
  asset.startProcessing();
  asset.markReady([]);
  return asset;
}

function deps() {
  const storage = {
    uploadObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(Buffer.from('take')),
  };
  const audio = { speechWav: jest.fn().mockResolvedValue(Buffer.alloc(44 + 320)) };
  const prisma = { assetVariant: { create: jest.fn().mockResolvedValue({}) } };
  const writer = new SpeechVariantWriter(storage as any, audio as any, prisma as any);
  return { storage, audio, prisma, writer };
}

describe('SpeechVariantWriter', () => {
  it('stores a 16 kHz WAV next to the playback variants, privately', async () => {
    const asset = readyRecording();
    const { writer, storage, audio, prisma } = deps();

    const info = await writer.write(asset, Buffer.from('take'), 'webm');

    const key = asset.storageKey.variantKey('speech', 'wav').value;
    expect(audio.speechWav).toHaveBeenCalledWith(Buffer.from('take'), 'webm', 16_000);
    expect(storage.uploadObject).toHaveBeenCalledWith(key, expect.any(Buffer), 'audio/wav', false);
    expect(prisma.assetVariant.create).toHaveBeenCalledWith({
      data: { assetId: asset.id, variantType: 'speech', storageKey: key, mimeType: 'audio/wav', sizeBytes: 364n },
    });
    expect(info).toEqual({ variantType: 'speech', storageKey: key, mimeType: 'audio/wav', sizeBytes: 364n });
  });
});

describe('BackfillSpeechVariantsService', () => {
  function makeService(found: MediaAssetEntity[]) {
    const d = deps();
    const repo = { findReadyRecordingsWithoutVariant: jest.fn().mockResolvedValue(found) };
    const service = new BackfillSpeechVariantsService(repo as any, d.storage as any, d.writer);
    return { ...d, repo, service };
  }

  it('only counts in a dry run', async () => {
    const { service, repo, storage } = makeService([readyRecording(), readyRecording()]);

    const report = await service.run({ mode: 'dry-run' });

    expect(repo.findReadyRecordingsWithoutVariant).toHaveBeenCalledWith('speech', 500);
    expect(report).toEqual({ mode: 'dry-run', found: 2, written: 0, failed: [], skipped: false });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('writes each recording from its private original and reports the ones that fail', async () => {
    const good = readyRecording();
    const bad = readyRecording();
    const { service, storage, audio } = makeService([good, bad]);
    audio.speechWav.mockResolvedValueOnce(Buffer.alloc(44)).mockRejectedValueOnce(new Error('ffmpeg'));

    const report = await service.run({ mode: 'write', limit: 10 });

    expect(storage.getObject).toHaveBeenCalledWith(good.storageKey.value, false);
    expect(audio.speechWav).toHaveBeenCalledWith(expect.any(Buffer), 'webm', 16_000);
    expect(report).toEqual({ mode: 'write', found: 2, written: 1, failed: [bad.id], skipped: false });
  });

  it('clamps the limit to the ceiling', async () => {
    const { service, repo } = makeService([]);

    await service.run({ mode: 'dry-run', limit: 10_000 });
    await service.run({ mode: 'dry-run', limit: 0 });

    expect(repo.findReadyRecordingsWithoutVariant.mock.calls).toEqual([['speech', 500], ['speech', 1]]);
  });
});
