import type { NarrationSegment } from '@ssz/shared-kernel/narration';

import { buildWav, parseWav } from '../../../../src/infrastructure/audio/wav.js';
import { NarrationRenderer } from '../../../../src/modules/narration/infrastructure/narration-renderer.js';
import type { IVoiceResolver, SpeechRequest } from '../../../../src/shared/application/ports/speech-synthesizer.port.js';

const RATE = 1_000; // 1 frame per ms keeps the arithmetic readable
const FORMAT = { sampleRate: RATE, channels: 1, bitsPerSample: 16 };

/** Each segment "speaks" 10 ms of a non-zero sample, so speech and silence are told apart. */
function fakeSynthesizer(format = FORMAT) {
  return {
    provider: 'piper',
    synthesize: jest.fn(async (_request: SpeechRequest) => buildWav({ ...format, data: Buffer.alloc(10 * 2, 7) })),
  };
}

const STYLE = { lengthScale: 1.7, pauseScale: 1 };
const config = { get: () => ({ narrationLengthScale: 1.7, narrationNoiseWScale: 0 }) };
const renderer = (synthesizer: ReturnType<typeof fakeSynthesizer>, voices: IVoiceResolver) =>
  new NarrationRenderer(synthesizer, voices, config as never);

const oneVoice: IVoiceResolver = {
  resolve: (lang) => (lang === 'nb' ? { voice: 'nb-voice', family: 'no' } : null),
};

const segments: NarrationSegment[] = [
  { kind: 'heading', speaker: null, text: 'Prøvetiden' },
  { kind: 'turn', speaker: 'Silje', text: 'Hvordan går det?' },
  { kind: 'turn', speaker: 'Taras', text: 'Bra, takk.' },
  { kind: 'paragraph', speaker: null, text: 'Taras går ut av møtet.' },
];

/** Lengths of alternating runs of speech (non-zero) and silence (zero), in ms. */
function runs(wav: Buffer): Array<[string, number]> {
  const pcm = parseWav(wav).data;
  const out: Array<[string, number]> = [];
  for (let i = 0; i < pcm.length; i += 2) {
    const kind = pcm.readInt16LE(i) === 0 ? 'silence' : 'speech';
    const last = out[out.length - 1];
    if (last && last[0] === kind) last[1] += 1;
    else out.push([kind, 1]);
  }
  return out;
}

describe('NarrationRenderer', () => {
  it('speaks each segment and puts the D2 pauses between them', async () => {
    const synthesizer = fakeSynthesizer();
    const rendered = await renderer(synthesizer, oneVoice).render('nb', segments, STYLE);

    expect(runs(rendered.wav)).toEqual([
      ['speech', 10],
      ['silence', 900], // heading → turn
      ['speech', 10],
      ['silence', 600], // turn → turn
      ['speech', 10],
      ['silence', 900], // turn → paragraph
      ['speech', 10],
    ]);
    expect(rendered.durationMs).toBe(40 + 900 + 600 + 900);
    expect(rendered).toMatchObject({ provider: 'piper', voice: 'nb-voice' });
    expect(rendered.voices).toBeUndefined();
  });

  it('asks for the configured pace and a steady rhythm, never the voice defaults', async () => {
    const synthesizer = fakeSynthesizer();
    await renderer(synthesizer, oneVoice).render('nb', segments, STYLE);

    for (const [request] of synthesizer.synthesize.mock.calls) {
      expect(request.style).toEqual({ lengthScale: 1.7, noiseWScale: 0 });
    }
  });

  it('speaks at the chosen pace and scales the pauses between segments', async () => {
    const synthesizer = fakeSynthesizer();
    const rendered = await renderer(synthesizer, oneVoice).render('nb', segments, { lengthScale: 2.1, pauseScale: 0.5 });

    expect(synthesizer.synthesize.mock.calls[0]![0].style).toEqual({ lengthScale: 2.1, noiseWScale: 0 });
    expect(runs(rendered.wav).filter(([kind]) => kind === 'silence')).toEqual([
      ['silence', 450],
      ['silence', 300],
      ['silence', 450],
    ]);
  });

  it('never sends a speaker name to the synthesizer', async () => {
    const synthesizer = fakeSynthesizer();
    await renderer(synthesizer, oneVoice).render('nb', segments, STYLE);

    const texts = synthesizer.synthesize.mock.calls.map(([request]) => request.text);
    expect(texts).toEqual(['Prøvetiden', 'Hvordan går det?', 'Bra, takk.', 'Taras går ut av møtet.']);
  });

  it('gives a speaker their own voice when the resolver has one (D1)', async () => {
    const synthesizer = fakeSynthesizer();
    const perSpeaker: IVoiceResolver = {
      resolve: (_lang, speaker) => ({ voice: speaker === 'Silje' ? 'silje-voice' : 'nb-voice', family: 'no' }),
    };

    const rendered = await renderer(synthesizer, perSpeaker).render('nb', segments, STYLE);

    expect(rendered.voices).toEqual({ Silje: 'silje-voice' });
    expect(synthesizer.synthesize.mock.calls[1]![0]).toMatchObject({ voice: 'silje-voice' });
  });

  it('fails on an unsupported language, an empty script or mixed PCM formats', async () => {
    await expect(renderer(fakeSynthesizer(), oneVoice).render('en', segments, STYLE)).rejects.toThrow('no voice');
    await expect(renderer(fakeSynthesizer(), oneVoice).render('nb', [], STYLE)).rejects.toThrow('nothing');

    const mixed = fakeSynthesizer();
    mixed.synthesize.mockResolvedValueOnce(buildWav({ ...FORMAT, sampleRate: 2_000, data: Buffer.alloc(4, 7) }));
    await expect(renderer(mixed, oneVoice).render('nb', segments, STYLE)).rejects.toThrow('different PCM format');
  });
});
