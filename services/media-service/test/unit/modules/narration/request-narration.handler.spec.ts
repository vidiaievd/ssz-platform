import { RequestNarrationCommand } from '../../../../src/modules/narration/application/commands/request-narration/request-narration.command.js';
import { RequestNarrationHandler } from '../../../../src/modules/narration/application/commands/request-narration/request-narration.handler.js';
import type { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';

const BODY = '## 2D — Prøvetiden\n\n**Silje:** Hvordan synes du de første ukene har vært?\n\n**Taras:** Bra!';

function makeHandler(maxChars = 12_000) {
  const repo = { save: jest.fn().mockResolvedValue(undefined) };
  const voices = { resolve: jest.fn((lang: string) => (lang === 'nb' ? { voice: 'nb-voice', family: 'no' } : null)) };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const prisma = { processingJob: { create: jest.fn().mockResolvedValue({ id: 'job-1' }) } };
  const config = {
    get: jest.fn((key: string) =>
      key === 'tts'
        ? { narrationMaxChars: maxChars }
        : { maxImageSizeBytes: 1e7, maxAudioSizeBytes: 1e8, maxVideoSizeBytes: 1e9 },
    ),
  };
  const handler = new RequestNarrationHandler(repo as any, voices as any, queue as any, prisma as any, config as any);
  return { handler, repo, queue, prisma };
}

const command = (body = BODY, lang = 'nb', label: string | null = 'Les teksten — 2D') =>
  new RequestNarrationCommand('teacher-1', body, lang, label, 'lesson-1');

describe('RequestNarrationHandler', () => {
  it('creates a SYNTHESIZED lesson asset and queues the script', async () => {
    const { handler, repo, queue, prisma } = makeHandler();

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    const asset: MediaAssetEntity = repo.save.mock.calls[0]![0];
    expect(asset).toMatchObject({
      ownerId: 'teacher-1',
      entityType: 'lesson_asset',
      entityId: 'lesson-1',
      origin: 'SYNTHESIZED',
      status: 'PENDING_UPLOAD',
      originalFilename: 'les-teksten-2d.mp3',
    });
    expect(prisma.processingJob.create).toHaveBeenCalledWith({
      data: { assetId: asset.id, type: 'SPEECH_SYNTHESIS', status: 'PENDING' },
    });

    const [name, data, options] = queue.add.mock.calls[0]!;
    expect(name).toBe('SPEECH_SYNTHESIS');
    expect(data).toMatchObject({ assetId: asset.id, jobId: 'job-1', ownerId: 'teacher-1', lang: 'nb' });
    expect(data.segments.map((s: any) => s.speaker)).toEqual([null, 'Silje', 'Taras']);
    expect(options).toMatchObject({ jobId: 'job-1', attempts: 1 });

    expect(result.value).toEqual({
      assetId: asset.id,
      status: 'PENDING_UPLOAD',
      voice: 'nb-voice',
      textHash: data.textHash,
      segments: 3,
      characters: 'Prøvetiden'.length + 'Hvordan synes du de første ukene har vært?'.length + 'Bra!'.length,
    });
  });

  it('refuses a body with nothing to read, before creating anything', async () => {
    const { handler, repo, queue } = makeHandler();

    expect((await handler.execute(command('[audio:a1 "Les"]\n\n![x](media://b2)'))).error).toBe('EMPTY_TEXT');
    expect(repo.save).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('limits the spoken characters, not the markdown', async () => {
    // 40 spoken characters wrapped in a lot of markup and media.
    const body = `[audio:a1 "Les"]\n\n![bilde](media://p1)\n\n**Silje:** ${'a'.repeat(40)}`;
    expect((await makeHandler(40).handler.execute(command(body))).isOk).toBe(true);
    expect((await makeHandler(39).handler.execute(command(body))).error).toBe('TEXT_TOO_LONG');
  });

  it('refuses a language no voice speaks', async () => {
    expect((await makeHandler().handler.execute(command(BODY, 'en'))).error).toBe('LANGUAGE_NOT_SUPPORTED');
  });

  it('names the file narration.mp3 without a label', async () => {
    const { handler, repo } = makeHandler();
    await handler.execute(command(BODY, 'nb', null));
    expect(repo.save.mock.calls[0]![0].originalFilename).toBe('narration.mp3');
  });
});
