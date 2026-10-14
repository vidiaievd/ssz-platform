import type { MediaAssetModel } from '../../../../generated/prisma/models/MediaAsset.js';
import { MediaAssetMapper } from '../../../../src/modules/assets/infrastructure/persistence/mappers/media-asset.mapper.js';

const SYNTHESIS = {
  provider: 'piper',
  voice: 'no_NO-talesyntese-medium',
  lang: 'nb',
  textHash: 'a'.repeat(64),
  segments: 21,
};

function row(overrides: Partial<MediaAssetModel> = {}): MediaAssetModel {
  const now = new Date('2026-10-14T10:00:00Z');
  return {
    id: 'asset-1',
    ownerId: 'owner-1',
    entityType: 'lesson_asset',
    entityId: null,
    mimeType: 'audio/mpeg',
    sizeBytes: 1024n,
    storageKey: 'owner-1/abc/narration.mp3',
    originalFilename: 'narration.mp3',
    status: 'READY',
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    durationMs: 65_000,
    peaks: null,
    origin: 'UPLOAD',
    synthesis: null,
    supersededAt: null,
    supersededBy: null,
    ...overrides,
  };
}

describe('MediaAssetMapper — origin and synthesis (plan 74)', () => {
  it('reads an old row as an upload without synthesis', () => {
    const asset = MediaAssetMapper.toDomain(row());

    expect(asset.origin).toBe('UPLOAD');
    expect(asset.synthesis).toBeNull();
    expect(asset.supersededAt).toBeNull();
  });

  it('round-trips a synthesized asset', () => {
    const supersededAt = new Date('2026-10-15T08:00:00Z');
    const asset = MediaAssetMapper.toDomain(
      row({ origin: 'SYNTHESIZED', synthesis: SYNTHESIS, supersededAt, supersededBy: 'asset-2' }),
    );

    expect(asset.synthesis).toEqual(SYNTHESIS);
    expect(MediaAssetMapper.toUpdateData(asset)).toMatchObject({
      origin: 'SYNTHESIZED',
      synthesis: SYNTHESIS,
      supersededAt,
      supersededBy: 'asset-2',
    });
  });

  it('treats malformed synthesis JSON as absent', () => {
    for (const synthesis of [[1, 2], 'piper', { provider: 'piper' }, { ...SYNTHESIS, segments: '21' }]) {
      expect(MediaAssetMapper.toDomain(row({ origin: 'SYNTHESIZED', synthesis })).synthesis).toBeNull();
    }
  });

  it('never writes JSON null for an absent synthesis', () => {
    expect(MediaAssetMapper.toCreateData(MediaAssetMapper.toDomain(row())).synthesis).toBeUndefined();
  });
});
