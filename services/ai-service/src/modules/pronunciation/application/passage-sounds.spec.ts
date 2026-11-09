import { jest } from '@jest/globals';
import type { PronouncedWord } from '../../providers/domain/speech-result.js';
import { PassageSounds } from './passage-sounds.js';
import type { PassageVariants, PassageWord } from './passage-variants.js';

// Plan 88, step 5: Azure's words → the passage's variants → aligned sounds → the weak ones.

const phonemes = (...scores: number[]) => scores.map((accuracy, i) => ({ startMs: i * 80, durationMs: 80, accuracy }));

const PASSAGE: PassageWord[] = [
  { text: 'du', variants: [{ nofabet: 'D UU1', pos: 'PN' }], narrowedBy: 'feats', upos: 'PRON' },
  { text: 'kjører', variants: [{ nofabet: 'KJ OE1 R AX0 R', pos: 'VB' }], narrowedBy: 'feats', upos: 'VERB' },
];

function make() {
  const of = jest.fn(async (_language: string, _passage: string) => PASSAGE);
  return { service: new PassageSounds({ of } as unknown as PassageVariants), of };
}

describe('PassageSounds', () => {
  it('aligns every scored word with its passage word and picks the weak sounds', async () => {
    const { service, of } = make();
    const scored: PronouncedWord[] = [
      { text: 'du', accuracy: 50, error: 'none', phonemes: phonemes(90, 10) },
      { text: 'altså', accuracy: 0, error: 'insertion', phonemes: [] },
      { text: 'kjører', accuracy: 40, error: 'mispronunciation', phonemes: phonemes(5, 90, 90, 90, 90) },
    ];
    const sounds = await service.of('nb', 'Du kjører.', scored, 'fluent');

    expect(of).toHaveBeenCalledWith('nb', 'Du kjører.');
    expect(sounds!.map((s) => s.alignment.status)).toEqual(['aligned', 'unaligned', 'aligned']);
    // «du» is a function word: its vowel is not scored in fluent speech.
    expect(sounds!.map((s) => s.weak.map((w) => w.family))).toEqual([[], [], ['kj']]);
  });

  it('measures nothing without sounds or an inventory', async () => {
    const { service, of } = make();
    const plain: PronouncedWord[] = [{ text: 'du', accuracy: 90, error: 'none', phonemes: [] }];
    expect(await service.of('nb', 'Du.', plain, 'fluent')).toBeNull();
    expect(await service.of('en', 'You.', [{ ...plain[0]!, phonemes: phonemes(90, 90) }], 'fluent')).toBeNull();
    expect(of).not.toHaveBeenCalled();
  });
});
