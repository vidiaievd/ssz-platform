import type { AiGateway } from '../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import type { IPitchTracker, PitchSpan } from '../../pronunciation/application/ports/pitch-tracker.js';
import type { IPronunciationLexiconReader } from '../../pronunciation/application/ports/pronunciation-lexicon.reader.js';
import type { LexiconVariant } from '../../pronunciation/domain/align-word.js';
import type { PronouncedWord } from '../../providers/domain/speech-result.js';
import { Result } from '../../../shared/kernel/result.js';
import { MakeReferenceClipCommand } from './application/make-reference-clip/make-reference-clip.command.js';
import { MakeReferenceClipHandler } from './application/make-reference-clip/make-reference-clip.handler.js';
import { carrierOf, wordAt } from './domain/reference-clip.js';

const VOICES = ['nb-NO-PernilleNeural', 'nb-NO-FinnNeural', 'nb-NO-IselinNeural'];
const LEXICON: Record<string, LexiconVariant[]> = {
  bønner: [{ nofabet: 'B OEH2 N AX0 R' }],
  bønder: [{ nofabet: 'B OEH1 N AX0 R' }],
  hus: [{ nofabet: 'H UU1 S' }],
  finger: [
    { nofabet: 'F IH1 NG AX0 R', pos: 'NN' },
    { nofabet: 'F IH0 NG G EE1 R', pos: 'VB' },
  ],
  tømmer: [
    { nofabet: 'T OEH1 M AX0 R', pos: 'NN' },
    { nofabet: 'T OEH2 M AX0 R', pos: 'VB' },
  ],
};

// The word starts 800 ms into the clip; the stressed vowel at 850 (calibration of 02.11, «bønner»).
const PHONEMES = [
  [800, 40],
  [850, 70],
  [930, 60],
  [1000, 40],
  [1050, 40],
].map(([startMs, durationMs]) => ({ startMs: startMs!, durationMs: durationMs!, accuracy: 95 }));
// From the stressed vowel on: toneme 2 (bønner, Pernille) and toneme 1 (bønder, Iselin).
const TONE_2 = [
  2, 1.7, 1.5, 1.2, 0.8, 0.3, 0.1, 0.1, -0.3, -0.8, -1.4, -1.8, -2.1, -2.3, -2.5, -2.3, -2.2, -2.3, -2.3, -2.3, -2.3,
  -2.4,
];
const TONE_1 = [
  -0.3, -0.7, -1.1, -1.5, -1.8, -2.2, -2.5, -2.5, -2.7, -2.9, -2.9, -3, -3.1, -3.1, -3.1, -3.2, -2.9, -2.4, -2.2, -2,
  -1.7, -1.4,
];

function heard(word: string, accuracy = 95, phonemes = PHONEMES): PronouncedWord[] {
  const other = (text: string): PronouncedWord => ({ text, accuracy: 99, error: 'none', phonemes: [] });
  return [other('nå'), other('sier'), other('jeg'), { text: word, accuracy, error: 'none', phonemes }, other('igjen')];
}

interface Setup {
  voices?: string[];
  /** Azure's words per voice tried (0-based); default: the word heard well. */
  words?: (n: number, word: string) => PronouncedWord[];
  /** F0 from the stressed vowel per voice tried. */
  curves?: Array<Array<number | null>>;
  synthesis?: (n: number) => unknown;
  pitchFails?: boolean;
  lexiconFails?: boolean;
}

function setup(options: Setup = {}) {
  const contexts: CallContext[] = [];
  const spans: PitchSpan[][] = [];
  let synthesized = 0;
  let heardN = 0;
  let tracked = 0;
  const gateway = {
    voicesOf: jest.fn(async () => options.voices ?? VOICES),
    callSynthesis: jest.fn(async (_c: string, context: CallContext, request: { text: string; voice: string }) => {
      contexts.push(context);
      const n = synthesized++;
      const routed =
        (options.synthesis?.(n) as never) ??
        Result.ok({
          result: {
            audio: { format: 'wav', data: new Uint8Array([n]) },
            audioMs: 2250,
            voice: request.voice,
            characters: request.text.length,
          },
        });
      return { routed, recorded: { callId: `tts-${n}`, cost: null, credits: '0.0004' }, latencyMs: 5 };
    }),
    callSpeech: jest.fn(async (_c: string, context: CallContext, request: { referenceText: string }) => {
      contexts.push(context);
      const n = heardN++;
      const word = request.referenceText.split(' ')[3]!;
      const words = options.words?.(n, word) ?? heard(word);
      const result = {
        transcript: '',
        words: [],
        pronunciation: { accuracy: 95, fluency: 95, completeness: 100, prosody: null, words },
      };
      return {
        routed: Result.ok({ result }),
        recorded: { callId: `check-${n}`, cost: null, credits: '0.0006' },
        latencyMs: 5,
      };
    }),
  };
  const lexicon: IPronunciationLexiconReader = {
    variantsOf: jest.fn(async (_l: string, words: readonly string[]) => {
      if (options.lexiconFails) throw new Error('db down');
      return new Map(words.filter((w) => LEXICON[w]).map((w) => [w, LEXICON[w]!]));
    }),
  };
  const pitch: IPitchTracker = {
    track: jest.fn(async (_wav: Buffer, asked: readonly PitchSpan[]) => {
      if (options.pitchFails) throw new Error('Pitch tracker answered 404');
      spans.push([...asked]);
      const points = options.curves?.[tracked++] ?? TONE_2;
      return { durationMs: 2250, referenceHz: 180, stepMs: 10, curves: [{ ...asked[0]!, points }] };
    }),
  };
  const handler = new MakeReferenceClipHandler(gateway as unknown as AiGateway, lexicon, pitch);
  const make = (word: string, language = 'nb') => handler.execute(new MakeReferenceClipCommand({ language, word }));
  return { make, gateway, pitch, contexts, spans };
}

describe('reference clips (plan 88, step 6b.2)', () => {
  describe('carrier sentence', () => {
    it('puts the word in focus, not at the end', () => {
      expect(carrierOf('nb', 'bønner')).toEqual({ sentence: 'Nå sier jeg bønner igjen.', wordIndex: 3 });
      expect(carrierOf('en', 'beans')).toBeNull();
    });

    it("finds the word among Azure's, past an inserted one", () => {
      const words = heard('bønner');
      words.splice(1, 0, { text: 'eh', accuracy: 0, error: 'insertion', phonemes: [] });
      expect(wordAt(words, 3, 'bønner')?.text).toBe('bønner');
      expect(wordAt(words, 3, 'bønder')).toBeNull();
    });
  });

  it('keeps the first clip whose toneme agrees with the lexicon, paid by the platform', async () => {
    const { make, contexts, spans } = setup();
    const outcome = await make('bønner');

    expect(outcome).toMatchObject({
      status: 'ok',
      tone: 2,
      clip: {
        voice: 'nb-NO-PernilleNeural',
        sentence: 'Nå sier jeg bønner igjen.',
        audioMs: 2250,
        word: { startMs: 800, endMs: 1090 },
        stressedVowel: { startMs: 850, endMs: 920 },
      },
      tries: [{ voice: 'nb-NO-PernilleNeural', outcome: 'kept', accuracy: 95, measure: { tone: 2 } }],
      aiCallIds: ['tts-0', 'check-0'],
    });
    // From the stressed vowel to the post-tonic one's end and its tail.
    expect(spans).toEqual([[{ startMs: 850, endMs: 1070 }]]);
    expect(contexts.every((c) => c.payer.type === 'platform' && c.surface === 'authoring' && c.actor === null)).toBe(
      true,
    );
  });

  it('tries the next voice when a clip says the other toneme, and is rejected when none agrees', async () => {
    const second = setup({ curves: [TONE_1, TONE_2] });
    expect(await second.make('bønner')).toMatchObject({
      status: 'ok',
      clip: { voice: 'nb-NO-FinnNeural' },
      tries: [
        { voice: 'nb-NO-PernilleNeural', outcome: 'tone_mismatch', measure: { tone: 1 } },
        { voice: 'nb-NO-FinnNeural', outcome: 'kept' },
      ],
    });

    const none = setup({ curves: [TONE_2, TONE_2, TONE_2] });
    const outcome = await none.make('bønder');
    expect(outcome).toMatchObject({ status: 'rejected', tone: 1 });
    expect(outcome.status === 'rejected' && outcome.tries.map((t) => t.outcome)).toEqual([
      'tone_mismatch',
      'tone_mismatch',
      'tone_mismatch',
    ]);
    expect(outcome.status === 'rejected' && outcome.aiCallIds).toHaveLength(6);
  });

  it('does not keep a clip it cannot measure or hear as the word', async () => {
    const unvoiced = TONE_2.map((p, i) => (i < 10 ? null : p));
    const { make } = setup({
      curves: [unvoiced],
      words: (n, word) => (n === 1 ? heard(word, 40) : n === 2 ? heard(word, 95, PHONEMES.slice(0, 4)) : heard(word)),
    });
    const outcome = await make('bønner');
    expect(outcome.status === 'rejected' && outcome.tries.map((t) => [t.outcome, t.accuracy])).toEqual([
      ['not_measured', 95],
      ['not_heard', 40],
      ['not_aligned', 95],
    ]);
  });

  it('keeps only a clip whose sounds are the variant with the toneme («finger», not the imperative)', async () => {
    const verb = [...PHONEMES, { startMs: 1100, durationMs: 40, accuracy: 95 }];
    const { make } = setup({ curves: [TONE_1], words: (n, word) => heard(word, 95, n === 0 ? verb : PHONEMES) });
    expect(await make('finger')).toMatchObject({
      status: 'ok',
      tone: 1,
      tries: [{ outcome: 'not_aligned' }, { outcome: 'kept', measure: { tone: 1 } }],
    });
  });

  it('keeps a word without a toneme unmeasured', async () => {
    const phonemes = PHONEMES.slice(0, 3);
    const { make, pitch } = setup({ words: (_n, word) => heard(word, 95, phonemes) });
    expect(await make('hus')).toMatchObject({
      status: 'ok',
      tone: null,
      clip: { stressedVowel: null },
      tries: [{ measure: null }],
    });
    expect(pitch.track).not.toHaveBeenCalled();
  });

  it.each([
    ['tømmer', 'nb', 'tone_ambiguous'],
    ['sjiraff', 'nb', 'not_in_lexicon'],
    ['to ord', 'nb', 'not_a_word'],
    ['  ', 'nb', 'not_a_word'],
    ['beans', 'en', 'language_not_supported'],
  ])('refuses «%s» (%s) before any call: %s', async (word, language, reason) => {
    const { make, gateway } = setup();
    expect(await make(word, language)).toEqual({ status: 'refused', reason });
    expect(gateway.callSynthesis).not.toHaveBeenCalled();
  });

  it('is not available with no voice or synthesis switched off', async () => {
    expect(await setup({ voices: [] }).make('bønner')).toEqual({ status: 'refused', reason: 'not_available' });
    const off = setup({ synthesis: () => Result.fail({ kind: 'disabled', binding: null, attempts: [] }) });
    expect(await off.make('bønner')).toEqual({ status: 'refused', reason: 'not_available' });
  });

  it('fails without trying further when a model, the tracker or the lexicon does not answer', async () => {
    const timeout = setup({
      synthesis: (n) => (n === 0 ? Result.fail({ kind: 'error', error: { code: 'timeout' }, attempts: [] }) : null),
    });
    expect(await timeout.make('bønner')).toMatchObject({
      status: 'failed',
      errorCode: 'timeout',
      aiCallIds: ['tts-0'],
    });
    expect(timeout.gateway.callSynthesis).toHaveBeenCalledTimes(1);

    expect(await setup({ pitchFails: true }).make('bønner')).toMatchObject({
      status: 'failed',
      errorCode: 'pitch_unavailable',
    });
    expect(await setup({ lexiconFails: true }).make('bønner')).toMatchObject({
      status: 'failed',
      errorCode: 'lexicon_unavailable',
    });
  });
});
