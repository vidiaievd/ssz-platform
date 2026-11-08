import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';

import { InternalPronunciationController } from '../../../src/modules/pronunciation/internal-pronunciation.controller.js';
import type { PronunciationClipService } from '../../../src/modules/pronunciation/pronunciation-clip.service.js';
import type {
  ReferenceClip,
  ReferenceClipService,
} from '../../../src/modules/pronunciation/reference-clip.service.js';
import { Result } from '../../../src/shared/kernel/result.js';

const CLIP: ReferenceClip = {
  assetId: '7a1f3c2e-0b4d-4c5e-9f6a-1b2c3d4e5f60',
  voice: 'nb-NO-FinnNeural',
  tone: 2,
  sentence: 'Nå sier jeg kjenne igjen.',
  word: { startMs: 810, endMs: 1100 },
  stressedVowel: { startMs: 860, endMs: 930 },
  cached: false,
};

function controller(outcome: Result<ReferenceClip, string>) {
  const references = { getOrCreate: jest.fn().mockResolvedValue(outcome) };
  return {
    references,
    controller: new InternalPronunciationController(
      {} as PronunciationClipService,
      references as unknown as ReferenceClipService,
    ),
  };
}

describe('InternalPronunciationController.reference (plan 86, step 13.2c)', () => {
  it('serves the same clip as the author route, Norwegian by default', async () => {
    const { controller: c, references } = controller(Result.ok(CLIP));
    await expect(c.reference({ text: 'kjenne' })).resolves.toEqual(CLIP);
    expect(references.getOrCreate).toHaveBeenCalledWith('kjenne', 'nb');
  });

  it('answers a refusal as 422 with its code as the message', async () => {
    const { controller: c } = controller(Result.fail('TONE_AMBIGUOUS'));
    const thrown = await c.reference({ text: 'bønder', lang: 'nb' }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).message).toBe('TONE_AMBIGUOUS');
  });

  it.each(['NOT_AVAILABLE', 'SYNTHESIS_FAILED'])('answers %s as 503 — worth asking again', async (code) => {
    const { controller: c } = controller(Result.fail(code));
    const thrown = await c.reference({ text: 'kjenne' }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect((thrown as ServiceUnavailableException).message).toBe(code);
  });
});
