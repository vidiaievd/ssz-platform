import { RequestNarrationCommand } from '../../../../src/modules/narration/application/commands/request-narration/request-narration.command.js';
import { RequestNarrationHandler } from '../../../../src/modules/narration/application/commands/request-narration/request-narration.handler.js';
import type { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';

const BODY = '## 2D — Prøvetiden\n\n**Silje:** Hvordan synes du de første ukene har vært?\n\n**Taras:** Bra!';

function makeHandler(maxChars = 12_000) {
  const repo = { save: jest.fn().mockResolvedValue(undefined) };
  const NARRATOR = { id: 'talesyntese', voice: 'nb-voice', gender: 'male', name: 'T', paceFactor: 1, family: 'no' };
  const CHOSEN = { id: 'nvcc-kon', voice: 'multi', speaker: 'KON', gender: 'female', name: 'KON', paceFactor: 1.14, family: 'no' };
  const MALE = { id: 'nvcc-mmn', voice: 'multi', speaker: 'MMN', gender: 'male', name: 'MMN', paceFactor: 1.06, family: 'no' };
  const voices = {
    resolve: jest.fn((lang: string) => (lang === 'nb' ? NARRATOR : null)),
    byId: jest.fn((lang: string, id: string) => (lang === 'nb' && id === 'nvcc-kon' ? CHOSEN : null)),
    list: jest.fn((lang: string) => (lang === 'nb' ? [NARRATOR, CHOSEN, MALE] : [])),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const prisma = { processingJob: { create: jest.fn().mockResolvedValue({ id: 'job-1' }) } };
  const config = {
    get: jest.fn((key: string) =>
      key === 'tts'
        ? { narrationMaxChars: maxChars, narrationLengthScale: 1.7 }
        : { maxImageSizeBytes: 1e7, maxAudioSizeBytes: 1e8, maxVideoSizeBytes: 1e9 },
    ),
  };
  const handler = new RequestNarrationHandler(repo as any, voices as any, queue as any, prisma as any, config as any);
  return { handler, repo, queue, prisma };
}

const command = (
  body = BODY,
  lang = 'nb',
  label: string | null = 'Les teksten — 2D',
  style: {
    level?: string | null;
    lengthScale?: number | null;
    pauseScale?: number | null;
    voiceId?: string | null;
    speakerVoices?: Record<string, string> | null;
  } = {},
) =>
  new RequestNarrationCommand(
    'teacher-1',
    body,
    lang,
    label,
    'lesson-1',
    style.level ?? null,
    style.lengthScale ?? null,
    style.pauseScale ?? null,
    style.voiceId ?? null,
    style.speakerVoices ?? null,
  );

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
      voiceId: 'talesyntese',
      textHash: data.textHash,
      lengthScale: 1.7,
      pauseScale: 1,
      segments: 3,
      characters: 'Prøvetiden'.length + 'Hvordan synes du de første ukene har vært?'.length + 'Bra!'.length,
      // Neither is the narrator; a name says nothing about who carries it, so they alternate.
      speakerVoices: { Silje: 'nvcc-mmn', Taras: 'nvcc-kon' },
    });
    expect(data.speakerVoices).toEqual({ Silje: 'nvcc-mmn', Taras: 'nvcc-kon' });
  });

  it("gives a speaker the voice the author chose, and the others voices around it", async () => {
    const { handler, queue } = makeHandler();

    const result = await handler.execute(
      command(BODY, 'nb', null, { speakerVoices: { Silje: 'nvcc-kon', Nobody: 'nvcc-mmn' } }),
    );

    expect(result.value.speakerVoices).toEqual({ Silje: 'nvcc-kon', Taras: 'nvcc-mmn' });
    expect(queue.add.mock.calls[0]![1].speakerVoices).toEqual({ Silje: 'nvcc-kon', Taras: 'nvcc-mmn' });
  });

  it("speaks at the course level's pace unless the author chose another", async () => {
    const { handler, queue } = makeHandler();

    await handler.execute(command(BODY, 'nb', null, { level: 'A1' }));
    await handler.execute(command(BODY, 'nb', null, { level: 'A1', lengthScale: 2.2, pauseScale: 1.5 }));
    await handler.execute(command(BODY, 'nb', null, { level: 'C1', lengthScale: 9 }));

    const jobs = queue.add.mock.calls.map(([, data]) => data);
    expect(jobs[0]).toMatchObject({ lengthScale: 2.0, pauseScale: 1, level: 'A1' });
    expect(jobs[1]).toMatchObject({ lengthScale: 2.2, pauseScale: 1.5, level: 'A1' });
    expect(jobs[2]).toMatchObject({ lengthScale: 2.5, level: 'C1' });
  });

  it('narrates with the voice the author chose, and refuses one that does not exist', async () => {
    const { handler, queue } = makeHandler();

    const chosen = await handler.execute(command(BODY, 'nb', null, { voiceId: 'nvcc-kon' }));
    expect(chosen.value).toMatchObject({ voice: 'multi', voiceId: 'nvcc-kon' });
    expect(queue.add.mock.calls[0]![1]).toMatchObject({ voiceId: 'nvcc-kon' });

    const unknown = await handler.execute(command(BODY, 'nb', null, { voiceId: 'nope' }));
    expect(unknown.error).toBe('VOICE_NOT_AVAILABLE');
    expect(queue.add).toHaveBeenCalledTimes(1);
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
