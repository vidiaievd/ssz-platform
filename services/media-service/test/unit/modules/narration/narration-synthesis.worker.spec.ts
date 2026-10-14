jest.mock('../../../../src/infrastructure/audio/mp3-encoder.js', () => ({
  encodeMp3: jest.fn(async () => Buffer.from('mp3-bytes')),
}));
// The worker imports PrismaService by value; loading it would pull in the generated Prisma client.
jest.mock('../../../../src/infrastructure/database/prisma.service.js', () => ({ PrismaService: class {} }));

import { StoreSynthesizedAudioCommand } from '../../../../src/modules/assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import { NarrationSynthesisWorker } from '../../../../src/modules/narration/infrastructure/narration-synthesis.worker.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const DATA = {
  assetId: 'asset-1',
  jobId: 'job-1',
  ownerId: 'teacher-1',
  lang: 'nb',
  segments: [
    { kind: 'turn' as const, speaker: 'Silje', text: 'Hei.' },
    { kind: 'turn' as const, speaker: 'Taras', text: 'Hei!' },
  ],
  textHash: 'h'.repeat(64),
  lengthScale: 1.85,
  pauseScale: 1.5,
  level: 'A2',
  voiceId: 'nvcc-kon',
};

function makeWorker(opts: { render?: () => Promise<any>; store?: Result<void, any> } = {}) {
  const renderer = {
    render: jest.fn(
      opts.render ?? (async () => ({ wav: Buffer.from('wav'), durationMs: 1_600, provider: 'piper', voice: 'nb-voice', voiceId: 'nvcc-kon', speaker: 'KON' })),
    ),
  };
  const commandBus = { execute: jest.fn().mockResolvedValue(opts.store ?? Result.ok()) };
  const prisma = { processingJob: { update: jest.fn().mockResolvedValue({}) } };
  const asset = { isDeleted: false, markFailed: jest.fn(() => Result.ok()) };
  const repo = { findById: jest.fn().mockResolvedValue(asset), save: jest.fn().mockResolvedValue(undefined) };
  const worker = new NarrationSynthesisWorker(renderer as any, commandBus as any, prisma as any, repo as any);
  return { worker, renderer, commandBus, prisma, repo, asset };
}

describe('NarrationSynthesisWorker', () => {
  it('renders, encodes and stores the narration with its synthesis metadata', async () => {
    const { worker, renderer, commandBus, prisma } = makeWorker();

    await worker.process({ data: DATA } as any);

    expect(renderer.render).toHaveBeenCalledWith('nb', DATA.segments, { lengthScale: 1.85, pauseScale: 1.5 }, 'nvcc-kon');
    const store = commandBus.execute.mock.calls[0]![0] as StoreSynthesizedAudioCommand;
    expect(store).toBeInstanceOf(StoreSynthesizedAudioCommand);
    expect(store).toMatchObject({ assetId: 'asset-1', ownerId: 'teacher-1', mimeType: 'audio/mpeg' });
    expect(store.audio.toString()).toBe('mp3-bytes');
    expect(store.synthesis).toEqual({
      provider: 'piper',
      voice: 'nb-voice',
      voiceId: 'nvcc-kon',
      speaker: 'KON',
      lang: 'nb',
      textHash: DATA.textHash,
      segments: 2,
      lengthScale: 1.85,
      pauseScale: 1.5,
      level: 'A2',
    });
    expect(prisma.processingJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
  });

  it('turns the asset FAILED and keeps the reason when synthesis fails', async () => {
    const { worker, prisma, repo, asset, commandBus } = makeWorker({
      render: async () => {
        throw new Error('piper responded 500');
      },
    });

    await expect(worker.process({ data: DATA } as any)).rejects.toThrow('piper responded 500');

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(prisma.processingJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-1' },
      data: { status: 'FAILED', lastError: 'piper responded 500' },
    });
    expect(asset.markFailed).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(asset);
  });

  it('fails the same way when the audio cannot be stored', async () => {
    const { worker, asset } = makeWorker({ store: Result.fail('INVALID_STATUS_TRANSITION') });

    await expect(worker.process({ data: DATA } as any)).rejects.toThrow('INVALID_STATUS_TRANSITION');
    expect(asset.markFailed).toHaveBeenCalled();
  });

  it('leaves a deleted asset alone', async () => {
    const { worker, asset, repo } = makeWorker({ render: async () => Promise.reject(new Error('x')) });
    asset.isDeleted = true;

    await expect(worker.process({ data: DATA } as any)).rejects.toThrow('x');
    expect(asset.markFailed).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
