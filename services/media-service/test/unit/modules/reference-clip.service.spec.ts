import { ReferenceClipService } from '../../../src/modules/pronunciation/reference-clip.service.js';
import { RequestUploadCommand } from '../../../src/modules/assets/application/commands/request-upload/request-upload.command.js';
import { StoreSynthesizedAudioCommand } from '../../../src/modules/assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import {
  PLATFORM_OWNER_ID,
  REFERENCE_CLIP,
  referenceClipKey,
} from '../../../src/modules/assets/domain/policies/reference-clip-policy.js';
import { readAnswer } from '../../../src/infrastructure/tts/http-reference-synthesizer.js';
import type { ReferenceSynthesis } from '../../../src/shared/application/ports/reference-synthesizer.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

const WAV = Buffer.from('wav-bytes');
const TRIES = [
  {
    voice: 'nb-NO-PernilleNeural',
    outcome: 'tone_mismatch',
    accuracy: 98,
    measure: { onset: 0.2, post: 0.1, score: 0.1, tone: 1 as const },
  },
  {
    voice: 'nb-NO-FinnNeural',
    outcome: 'kept',
    accuracy: 99,
    measure: { onset: 1, post: -2.3, score: 3.3, tone: 2 as const },
  },
];
const OK: ReferenceSynthesis = {
  status: 'ok',
  tone: 2,
  tries: TRIES,
  clip: {
    wav: WAV,
    audioMs: 2238,
    voice: 'nb-NO-FinnNeural',
    sentence: 'Nå sier jeg bønner igjen.',
    word: { startMs: 810, endMs: 1100 },
    stressedVowel: { startMs: 860, endMs: 930 },
  },
};

function makeService(
  opts: {
    made?: ReferenceSynthesis | Error;
    stored?: unknown[];
    verdict?: string | null;
    store?: Result<unknown, unknown>;
  } = {},
) {
  const synthesizer = {
    provider: 'ai-service',
    reference: jest.fn(async () => {
      if (opts.made instanceof Error) throw opts.made;
      return opts.made ?? OK;
    }),
  };
  const assets = { findMany: jest.fn(async () => opts.stored ?? []) };
  const cache = {
    get: jest.fn(async () => opts.verdict ?? null),
    set: jest.fn(async () => undefined),
  };
  const commandBus = {
    execute: jest.fn(async (command: unknown) => {
      if (command instanceof RequestUploadCommand) {
        return Result.ok({
          assetId: 'asset-1',
          storageKey: 'k',
          uploadUrl: 'u',
          expiresAt: new Date(),
        });
      }
      return opts.store ?? Result.ok();
    }),
  };
  const service = new ReferenceClipService(
    synthesizer as any,
    assets as any,
    cache as any,
    commandBus as any,
  );
  return { service, synthesizer, assets, cache, commandBus };
}

describe('ReferenceClipService (plan 88, step 6b.3)', () => {
  it('keeps the checked clip as a reference_clip asset of the platform, the check in its synthesis', async () => {
    const { service, commandBus, synthesizer } = makeService();

    const result = await service.getOrCreate(' Bønner ', 'nb');

    expect(synthesizer.reference).toHaveBeenCalledWith('Bønner', 'nb');
    expect(result.value).toEqual({
      assetId: 'asset-1',
      voice: 'nb-NO-FinnNeural',
      tone: 2,
      sentence: 'Nå sier jeg bønner igjen.',
      word: { startMs: 810, endMs: 1100 },
      stressedVowel: { startMs: 860, endMs: 930 },
      cached: false,
    });
    expect(commandBus.execute.mock.calls[0]![0]).toMatchObject({
      ownerId: PLATFORM_OWNER_ID,
      mimeType: 'audio/wav',
      sizeBytes: BigInt(WAV.length),
      entityType: REFERENCE_CLIP,
      entityId: 'nb:bønner',
      origin: 'SYNTHESIZED',
    });
    const store = commandBus.execute.mock.calls[1]![0] as StoreSynthesizedAudioCommand;
    expect(store).toMatchObject({
      assetId: 'asset-1',
      ownerId: PLATFORM_OWNER_ID,
      audio: WAV,
      mimeType: 'audio/wav',
    });
    expect(store.synthesis).toEqual({
      provider: 'ai-service',
      voice: 'nb-NO-FinnNeural',
      lang: 'nb',
      textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      segments: 1,
      reference: {
        word: 'Bønner',
        sentence: 'Nå sier jeg bønner igjen.',
        tone: 2,
        wordSpan: { startMs: 810, endMs: 1100 },
        stressedVowel: { startMs: 860, endMs: 930 },
        tries: TRIES,
      },
    });
  });

  it('serves a stored clip of the platform without asking again', async () => {
    const stored = {
      id: 'asset-0',
      status: 'READY',
      synthesis: {
        voice: 'nb-NO-PernilleNeural',
        reference: {
          tone: 1,
          sentence: 'Nå sier jeg bønder igjen.',
          wordSpan: { startMs: 1, endMs: 2 },
          stressedVowel: null,
        },
      },
    };
    const halfWritten = { id: 'asset-x', status: 'PENDING_UPLOAD', synthesis: null };
    const { service, assets, synthesizer } = makeService({ stored: [halfWritten, stored] });

    const result = await service.getOrCreate('bønder', 'nb');

    expect(result.value).toMatchObject({
      assetId: 'asset-0',
      voice: 'nb-NO-PernilleNeural',
      tone: 1,
      cached: true,
    });
    expect(assets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: PLATFORM_OWNER_ID,
        entityType: REFERENCE_CLIP,
        entityId: 'nb:bønder',
      }),
    );
    expect(synthesizer.reference).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'rejected', tone: 1, tries: TRIES }, 'REFERENCE_REJECTED'],
    [{ status: 'refused', reason: 'tone_ambiguous' }, 'TONE_AMBIGUOUS'],
    [{ status: 'refused', reason: 'not_in_lexicon' }, 'NOT_IN_LEXICON'],
  ] as const)('remembers a word that cannot get a clip (%j → %s)', async (made, error) => {
    const { service, cache, commandBus } = makeService({ made: made as ReferenceSynthesis });
    expect((await service.getOrCreate('finger', 'nb')).error).toBe(error);
    expect(cache.set).toHaveBeenCalledWith('reference:verdict:nb:finger', error, 30 * 24 * 3600);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('answers a remembered verdict without asking', async () => {
    const { service, synthesizer } = makeService({ verdict: 'REFERENCE_REJECTED' });
    expect((await service.getOrCreate('gate', 'nb')).error).toBe('REFERENCE_REJECTED');
    expect(synthesizer.reference).not.toHaveBeenCalled();
  });

  it('does not remember an outage or a switched-off synthesis', async () => {
    const down = makeService({ made: new Error('ai-service responded 502') });
    expect((await down.service.getOrCreate('bønner', 'nb')).error).toBe('SYNTHESIS_FAILED');
    const off = makeService({ made: { status: 'refused', reason: 'not_available' } });
    expect((await off.service.getOrCreate('bønner', 'nb')).error).toBe('NOT_AVAILABLE');
    expect(down.cache.set).not.toHaveBeenCalled();
    expect(off.cache.set).not.toHaveBeenCalled();
  });

  it('refuses an empty text or more than one word before anything', async () => {
    const { service, assets } = makeService();
    expect((await service.getOrCreate('  ', 'nb')).error).toBe('EMPTY_TEXT');
    expect((await service.getOrCreate('to ord', 'nb')).error).toBe('NOT_A_WORD');
    expect(assets.findMany).not.toHaveBeenCalled();
  });

  it('shares one synthesis between two asks of the same word', async () => {
    const { service, synthesizer } = makeService();
    const [a, b] = await Promise.all([
      service.getOrCreate('bønner', 'nb'),
      service.getOrCreate('BØNNER', 'nb'),
    ]);
    expect(a.value).toEqual(b.value);
    expect(synthesizer.reference).toHaveBeenCalledTimes(1);
  });

  it('reports a refused store as ASSET_REJECTED', async () => {
    const { service } = makeService({ store: Result.fail('ASSET_NOT_FOUND') });
    expect((await service.getOrCreate('bønner', 'nb')).error).toBe('ASSET_REJECTED');
  });

  it('keys a clip by language and the word in lower case', () => {
    expect(referenceClipKey('NB', ' Bønner ')).toBe('nb:bønner');
  });
});

describe("ai-service's reference answer", () => {
  it('reads a kept clip, the WAV from base64', () => {
    const answer = readAnswer({
      status: 'ok',
      tone: 2,
      tries: TRIES,
      clip: {
        wav: WAV.toString('base64'),
        audioMs: 2238,
        voice: 'v',
        sentence: 's',
        word: { startMs: 1, endMs: 2 },
        stressedVowel: null,
      },
    });
    expect(answer).toMatchObject({
      status: 'ok',
      tone: 2,
      clip: { wav: WAV, voice: 'v', stressedVowel: null },
    });
  });

  it('reads rejected and refused, and throws on a failure or a clip-less ok', () => {
    expect(readAnswer({ status: 'rejected', tone: 1, tries: [] })).toEqual({
      status: 'rejected',
      tone: 1,
      tries: [],
    });
    expect(readAnswer({ status: 'refused', reason: 'tone_ambiguous' })).toEqual({
      status: 'refused',
      reason: 'tone_ambiguous',
    });
    expect(() => readAnswer({ status: 'failed', errorCode: 'pitch_unavailable' })).toThrow(
      'pitch_unavailable',
    );
    expect(() => readAnswer({ status: 'ok' })).toThrow('without a clip');
  });
});
