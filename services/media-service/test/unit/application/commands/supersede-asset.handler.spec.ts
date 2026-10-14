import { SupersedeAssetCommand } from '../../../../src/modules/assets/application/commands/supersede-asset/supersede-asset.command.js';
import { SupersedeAssetHandler } from '../../../../src/modules/assets/application/commands/supersede-asset/supersede-asset.handler.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';

const SIZE_LIMITS = { maxImageSizeBytes: 1e7, maxAudioSizeBytes: 1e8, maxVideoSizeBytes: 1e9 };

function lessonAsset(ownerId = 'owner-1', entityType = 'lesson_asset') {
  return MediaAssetEntity.create({
    ownerId,
    mimeType: 'audio/mpeg',
    sizeBytes: 1024,
    originalFilename: 'narration.mp3',
    entityType,
    sizeLimits: SIZE_LIMITS,
  }).value;
}

function makeHandler(...assets: MediaAssetEntity[]) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const repo = {
    findById: jest.fn(async (id: string) => byId.get(id) ?? null),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn().mockReturnValue({ narrationRetentionDays: 30 }) };
  return { handler: new SupersedeAssetHandler(repo as any, config as any), repo };
}

describe('SupersedeAssetHandler', () => {
  it('marks the old narration replaced and leaves it playable', async () => {
    const old = lessonAsset();
    const fresh = lessonAsset('owner-2');
    const { handler, repo } = makeHandler(old, fresh);

    const result = await handler.execute(new SupersedeAssetCommand(old.id, fresh.id));

    expect(result.isOk).toBe(true);
    expect(old.supersededBy).toBe(fresh.id);
    expect(old.isDeleted).toBe(false);
    expect(result.value.restoredReplacement).toBe(false);
    const days = (Date.parse(result.value.restorableUntil) - Date.parse(result.value.supersededAt)) / 86_400_000;
    expect(days).toBe(30);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('goes back: superseding the new one by the old one puts the old one in use again', async () => {
    const old = lessonAsset();
    const fresh = lessonAsset();
    const { handler, repo } = makeHandler(old, fresh);
    await handler.execute(new SupersedeAssetCommand(old.id, fresh.id));

    const back = await handler.execute(new SupersedeAssetCommand(fresh.id, old.id));

    expect(back.value.restoredReplacement).toBe(true);
    expect(old.isSuperseded).toBe(false);
    expect(fresh.supersededBy).toBe(old.id);
    expect(repo.save).toHaveBeenLastCalledWith(old);
  });

  it('refuses media that is not lesson media, and an asset replaced by itself', async () => {
    const recording = lessonAsset('owner-1', 'exercise_asset');
    const fresh = lessonAsset();
    const { handler } = makeHandler(recording, fresh);

    expect((await handler.execute(new SupersedeAssetCommand(recording.id, fresh.id))).error).toBe('SUPERSEDE_NOT_ALLOWED');
    expect((await handler.execute(new SupersedeAssetCommand(fresh.id, fresh.id))).error).toBe('SUPERSEDE_NOT_ALLOWED');
  });

  it('reports a missing asset or replacement', async () => {
    const old = lessonAsset();
    const { handler, repo } = makeHandler(old);

    expect((await handler.execute(new SupersedeAssetCommand('nope', old.id))).error).toBe('ASSET_NOT_FOUND');
    expect((await handler.execute(new SupersedeAssetCommand(old.id, 'nope'))).error).toBe('REPLACEMENT_NOT_FOUND');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
