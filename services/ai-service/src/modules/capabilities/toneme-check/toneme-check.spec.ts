import type { AiGateway } from '../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import type { IPitchTracker, PitchSpan } from '../../pronunciation/application/ports/pitch-tracker.js';
import type { IPronunciationLexiconReader } from '../../pronunciation/application/ports/pronunciation-lexicon.reader.js';
import type { LexiconVariant } from '../../pronunciation/domain/align-word.js';
import type { PronouncedWord } from '../../providers/domain/speech-result.js';
import { Result } from '../../../shared/kernel/result.js';
import type {
  IRecordingAudioSource,
  RecordingAudio,
} from '../voice-review/application/ports/recording-audio.source.js';
import type { IReferenceClipSource, ReferenceClipAudio } from './application/ports/reference-clip.source.js';
import { CheckTonemeCommand, type TonemeCheckRequest } from './application/check-toneme/check-toneme.command.js';
import { CheckTonemeHandler } from './application/check-toneme/check-toneme.handler.js';
import type { StoredReference } from './domain/stored-reference.js';

const LEXICON: Record<string, LexiconVariant[]> = {
  bønner: [{ nofabet: 'B OEH2 N AX0 R' }],
  hus: [{ nofabet: 'H UU1 S' }],
  tømmer: [
    { nofabet: 'T OEH1 M AX0 R', pos: 'NN' },
    { nofabet: 'T OEH2 M AX0 R', pos: 'VB' },
  ],
};

// Not a WAV: its level is not read, so the take counts as audible. The first byte tells the takes apart.
const TAKE = new Uint8Array([1, 0, 0, 0]);
const CLIP = new Uint8Array([2, 0, 0, 0]);

/** A real WAV of silence: 16-bit, 16 kHz, mono, half a second. */
function silentWav(): Uint8Array {
  const samples = 8000;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return new Uint8Array(buffer);
}

const BONNER: StoredReference = {
  word: 'bønner',
  sentence: 'Nå sier jeg bønner igjen.',
  tone: 2,
  wordSpan: { startMs: 820, endMs: 1240 },
  stressedVowel: { startMs: 870, endMs: 940 },
  score: 3.3,
  voice: 'nb-NO-PernilleNeural',
};

// The learner's word starts 800 ms into the take; the stressed vowel at 850.
const PHONEMES = [
  [800, 40],
  [850, 70],
  [930, 60],
  [1000, 40],
  [1050, 40],
].map(([startMs, durationMs]) => ({ startMs: startMs!, durationMs: durationMs!, accuracy: 90 }));
// From the stressed vowel on. Toneme 2 as Pernille said it (score 3.3); flat and rising — toneme 1 (score −3).
const TONE_2 = [
  2, 1.7, 1.5, 1.2, 0.8, 0.3, 0.1, 0.1, -0.3, -0.8, -1.4, -1.8, -2.1, -2.3, -2.5, -2.3, -2.2, -2.3, -2.3, -2.3, -2.3,
  -2.4, -2.4,
];
const RISING = Array.from({ length: 27 }, (_, i) => (i < 15 ? -2 : 1));

function heard(word: string, phonemes = PHONEMES): PronouncedWord[] {
  const other = (text: string): PronouncedWord => ({ text, accuracy: 99, error: 'none', phonemes: [] });
  return [
    other('nå'),
    other('sier'),
    other('jeg'),
    { text: word, accuracy: 92, error: 'none', phonemes },
    other('igjen'),
  ];
}

interface Setup {
  words?: PronouncedWord[];
  learnerCurve?: Array<number | null>;
  reference?: ReferenceClipAudio;
  recording?: RecordingAudio;
  speech?: unknown;
  pitchFails?: boolean;
}

function setup(options: Setup = {}) {
  const contexts: CallContext[] = [];
  const spans: Array<{ take: number; spans: PitchSpan[] }> = [];
  const gateway = {
    callSpeech: jest.fn(async (_c: string, context: CallContext, request: { referenceText: string }) => {
      contexts.push(context);
      const word = request.referenceText.split(' ')[3]!;
      const words = options.words ?? heard(word);
      const routed =
        (options.speech as never) ??
        Result.ok({
          result: {
            transcript: '',
            words: [],
            pronunciation: { accuracy: 92, fluency: 90, completeness: 100, prosody: null, words },
          },
        });
      return { routed, recorded: { callId: 'heard-1', cost: null, credits: '0.0006' }, latencyMs: 5 };
    }),
  };
  const lexicon: IPronunciationLexiconReader = {
    variantsOf: jest.fn(
      async (_l: string, words: readonly string[]) =>
        new Map(words.filter((w) => LEXICON[w]).map((w) => [w, LEXICON[w]!])),
    ),
  };
  const pitch: IPitchTracker = {
    track: jest.fn(async (wav: Buffer, asked: readonly PitchSpan[]) => {
      if (options.pitchFails) throw new Error('Pitch tracker answered 404');
      spans.push({ take: wav[0]!, spans: [...asked] });
      const points = wav[0] === 1 ? (options.learnerCurve ?? TONE_2) : TONE_2;
      return { durationMs: 2250, referenceHz: 180, stepMs: 10, curves: [{ ...asked[0]!, points }] };
    }),
  };
  const recordings: IRecordingAudioSource = {
    fetch: jest.fn(async () => options.recording ?? { kind: 'ready' as const, wav: TAKE }),
  };
  const references: IReferenceClipSource = {
    fetch: jest.fn(async () => options.reference ?? { kind: 'ready' as const, wav: CLIP, reference: BONNER }),
  };
  const handler = new CheckTonemeHandler(gateway as unknown as AiGateway, lexicon, pitch, recordings, references);
  const check = (request: Partial<TonemeCheckRequest> = {}) =>
    handler.execute(
      new CheckTonemeCommand({
        schoolId: 'school-1',
        userId: 'learner-1',
        language: 'nb',
        word: 'bønner',
        recordingAssetId: 'take-1',
        referenceAssetId: 'clip-1',
        ...request,
      }),
    );
  return { check, gateway, pitch, contexts, spans };
}

describe('toneme check (plan 88, step 8.3)', () => {
  it('compares the take with the reference under the school’s ai.practice and gives both melodies', async () => {
    const { check, contexts, spans } = setup();
    const outcome = await check();

    expect(outcome).toMatchObject({
      status: 'ok',
      word: 'bønner',
      sentence: 'Nå sier jeg bønner igjen.',
      accuracy: 92,
      comparison: {
        tone: 2,
        referenceScore: 3.3,
        learner: { score: 3.3, tone: null },
        gap: 0,
        verdict: { kind: 'like_reference' },
      },
      melody: { stepMs: 10, learner: TONE_2, reference: TONE_2 },
      atomRef: null,
      aiCallIds: ['heard-1'],
    });
    // Both from the stressed vowel to the word's end and its tail.
    expect(spans).toEqual([
      { take: 1, spans: [{ startMs: 850, endMs: 1120 }] },
      { take: 2, spans: [{ startMs: 870, endMs: 1270 }] },
    ]);
    expect(contexts).toEqual([
      {
        payer: { type: 'workspace', id: 'school-1' },
        actor: { userId: 'learner-1', role: 'student' },
        surface: 'pronunciation_drill',
      },
    ]);
  });

  it('says the other toneme with its atom, the learner paying without a school', async () => {
    const { check, contexts } = setup({ learnerCurve: RISING });
    expect(await check({ schoolId: null })).toMatchObject({
      status: 'ok',
      comparison: { learner: { score: -3, tone: 1 }, gap: -6.3, verdict: { kind: 'other_tone', heardAs: 1 } },
      atomRef: { atomType: 'sound', atomId: 'nb:tone' },
    });
    expect(contexts[0]!.payer).toEqual({ type: 'user', id: 'learner-1' });
  });

  it('gives the melodies without a verdict when the take is not voiced where the toneme is', async () => {
    const unvoiced = TONE_2.map((p, i) => (i < 6 ? null : p));
    expect(await setup({ learnerCurve: unvoiced }).check()).toMatchObject({
      status: 'ok',
      comparison: { learner: null, gap: null, verdict: { kind: 'not_measured' } },
      melody: { learner: unvoiced },
      atomRef: null,
    });
  });

  it.each([
    ['tømmer', 'nb', 'tone_ambiguous'],
    ['hus', 'nb', 'no_toneme'],
    ['sjiraff', 'nb', 'not_in_lexicon'],
    ['to ord', 'nb', 'not_a_word'],
    ['beans', 'en', 'language_not_supported'],
  ])('refuses «%s» (%s) before any call: %s', async (word, language, reason) => {
    const { check, gateway } = setup();
    expect(await check({ word, language })).toEqual({ status: 'refused', reason });
    expect(gateway.callSpeech).not.toHaveBeenCalled();
  });

  it.each<[string, ReferenceClipAudio, unknown]>([
    ['not a reference clip', { kind: 'not_a_reference' }, { status: 'refused', reason: 'not_a_reference' }],
    ['a clip kept unmeasured', { kind: 'no_toneme' }, { status: 'refused', reason: 'no_toneme' }],
    [
      'a clip of another word',
      { kind: 'ready', wav: CLIP, reference: { ...BONNER, word: 'bønder', tone: 1 } },
      { status: 'refused', reason: 'not_a_reference' },
    ],
    [
      'a clip media is still processing',
      { kind: 'pending' },
      { status: 'failed', errorCode: 'reference_not_ready', aiCallIds: [] },
    ],
    ['no clip', { kind: 'missing' }, { status: 'failed', errorCode: 'reference_missing', aiCallIds: [] }],
  ])('pays nothing for %s', async (_label, reference, expected) => {
    const { check, gateway } = setup({ reference });
    expect(await check()).toEqual(expected);
    expect(gateway.callSpeech).not.toHaveBeenCalled();
  });

  it.each<[string, RecordingAudio, string]>([
    ['missing', { kind: 'missing' }, 'recording_missing'],
    ['not ready', { kind: 'pending' }, 'recording_not_ready'],
    ['silent', { kind: 'ready', wav: silentWav() }, 'recording_inaudible'],
  ])('pays nothing for a take %s', async (_label, recording, errorCode) => {
    const { check, gateway } = setup({ recording });
    expect(await check()).toEqual({ status: 'failed', errorCode, aiCallIds: [] });
    expect(gateway.callSpeech).not.toHaveBeenCalled();
  });

  it('tells a word not heard from sounds that are not the word’s', async () => {
    const missing = heard('bønner').filter((w) => w.text !== 'bønner');
    expect(await setup({ words: missing }).check()).toEqual({
      status: 'unheard',
      reason: 'word_not_heard',
      accuracy: null,
      aiCallIds: ['heard-1'],
    });
    expect(await setup({ words: heard('bønner', PHONEMES.slice(0, 4)) }).check()).toMatchObject({
      status: 'unheard',
      reason: 'sounds_not_aligned',
      accuracy: 92,
    });
  });

  it('maps a gateway that does not answer as a rehearsal does', async () => {
    const quota = setup({ speech: Result.fail({ kind: 'refused', code: 'quota_exhausted' }) });
    expect(await quota.check()).toEqual({ status: 'refused', reason: 'pool_empty' });
    const off = setup({ speech: Result.fail({ kind: 'disabled', binding: null, attempts: [] }) });
    expect(await off.check()).toEqual({ status: 'refused', reason: 'not_available' });
    const timeout = setup({ speech: Result.fail({ kind: 'error', error: { code: 'timeout' }, attempts: [] }) });
    expect(await timeout.check()).toEqual({ status: 'failed', errorCode: 'timeout', aiCallIds: ['heard-1'] });
  });

  it('fails with the paid call’s id when the tracker does not answer', async () => {
    expect(await setup({ pitchFails: true }).check()).toEqual({
      status: 'failed',
      errorCode: 'pitch_unavailable',
      aiCallIds: ['heard-1'],
    });
  });
});
