import type { AiGateway, GatewayCall } from '../../gateway/application/ai-gateway.js';
import type { SpeechGatewayRequest } from '../../gateway/application/model-router.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { Result } from '../../../shared/kernel/result.js';
import type { PassageSounds } from '../../pronunciation/application/passage-sounds.js';
import type { SpeechResult } from '../../providers/domain/speech-result.js';
import { levelledWav } from '../../providers/domain/wav.fixture.js';
import type { ISchoolLanguageReader } from '../review-draft/application/ports/school-language.reader.js';
import type { RecordingAudio } from '../voice-review/application/ports/recording-audio.source.js';
import type { ISentenceCheckLimiter, SentenceCheckDecision } from './application/ports/sentence-check.limiter.js';
import { SentenceCheckCommand, type SentenceCheckRequest } from './application/sentence-check/sentence-check.command.js';
import { SENTENCE_CHECK_SURFACE, SentenceCheckHandler } from './application/sentence-check/sentence-check.handler.js';
import { SoundExplainer } from '../pronunciation-explain/application/sound-explainer.js';

const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const LEARNER = 'b0000000-0000-4000-8000-000000000002';
const EXERCISE = 'c0000000-0000-5000-8000-000000000003';
const SENTENCE = 'Jeg liker kveld.';
const GOOD_WAV = levelledWav([{ ms: 500, dbfs: -60 }, { ms: 2_000, dbfs: -20 }]);

const request = (over: Partial<SentenceCheckRequest> = {}): SentenceCheckRequest => ({
  schoolId: SCHOOL,
  userId: LEARNER,
  exerciseId: EXERCISE,
  language: 'nb',
  explanationLanguage: 'ru',
  sentence: SENTENCE,
  recordingAssetId: 'a0000000-0000-4000-8000-000000000001',
  ...over,
});

const heard = (): SpeechResult =>
  ({
    words: [{ text: 'Jeg', startMs: 0, endMs: 300, confidence: 0.9 }],
    pronunciation: { accuracy: 80, fluency: 0, completeness: 90, prosody: null, words: [{ text: 'Jeg', accuracy: 80, error: 'none', phonemes: [] }] },
  }) as unknown as SpeechResult;

function setup(
  over: {
    audio?: RecordingAudio | Error;
    limiter?: SentenceCheckDecision;
    routed?: unknown;
    sounds?: PassageSounds;
  } = {},
) {
  const speech: Array<{ capability: string; context: CallContext; request: SpeechGatewayRequest }> = [];
  const taken: Array<[string, string]> = [];
  const gateway = {
    call: async () =>
      ({ routed: Result.fail({ kind: 'disabled', binding: null }), recorded: { callId: 'explain-off', cost: null, credits: null }, latencyMs: 1 }) as unknown as GatewayCall,
    callSpeech: async (capability: string, context: CallContext, req: SpeechGatewayRequest) => {
      speech.push({ capability, context, request: req });
      return { routed: over.routed ?? Result.ok({ result: heard() }), recorded: { callId: 'speech-1', cost: null, credits: '0.01' }, latencyMs: 5 };
    },
  } as unknown as AiGateway;
  const recordings = {
    fetch: async () => {
      const audio = over.audio ?? ({ kind: 'ready', wav: GOOD_WAV } as RecordingAudio);
      if (audio instanceof Error) throw audio;
      return audio;
    },
  };
  const limiter: ISentenceCheckLimiter = {
    take: async (userId, sentence) => {
      taken.push([userId, sentence]);
      return over.limiter ?? { allowed: true };
    },
  };
  const sounds = over.sounds ?? ({ of: async () => null } as unknown as PassageSounds);
  const handler = new SentenceCheckHandler(gateway, recordings, limiter, sounds, { explanationLanguage: async () => 'ru' } as ISchoolLanguageReader, new SoundExplainer(gateway, { base: async () => [] }));
  return { run: (req = request()) => handler.execute(new SentenceCheckCommand(req)), speech, taken };
}

describe('SentenceCheckHandler (plan 86, step 6g)', () => {
  it('hears the take as the school under practice_voice on the drill surface, with no rehearsal subject limits', async () => {
    const { run, speech, taken } = setup();
    const outcome = await run();
    expect(outcome.status).toBe('ok');
    expect(speech).toHaveLength(1);
    expect(speech[0]!.capability).toBe('practice_voice');
    expect(speech[0]!.context.payer).toEqual({ type: 'workspace', id: SCHOOL });
    expect(speech[0]!.context.surface).toBe(SENTENCE_CHECK_SURFACE);
    expect(speech[0]!.context.subject?.exerciseId).toBe(EXERCISE);
    expect(speech[0]!.request.referenceText).toBe(SENTENCE);
    expect(taken).toEqual([[LEARNER, SENTENCE]]);
    if (outcome.status === 'ok') expect((outcome.feedback.words ?? []).map((w) => w.passageIndex)).toEqual([0]);
  });

  it('bills the learner when there is no school, and leaves the exercise off the ledger when none is given', async () => {
    const { run, speech } = setup();
    await run(request({ schoolId: null, exerciseId: null }));
    expect(speech[0]!.context.payer).toEqual({ type: 'user', id: LEARNER });
    expect(speech[0]!.context.subject ?? null).toBeNull();
  });

  it('refuses a language with no sound inventory before counting a try', async () => {
    const { run, speech, taken } = setup();
    expect(await run(request({ language: 'en' }))).toEqual({ status: 'refused', reason: 'language_not_supported', retryAfterMs: null });
    expect(speech).toHaveLength(0);
    expect(taken).toHaveLength(0);
  });

  it('refuses at the sentence limit without fetching or calling', async () => {
    const { run, speech } = setup({ limiter: { allowed: false, retryAfterMs: 5_000 }, audio: new Error('must not be fetched') });
    expect(await run()).toEqual({ status: 'refused', reason: 'attempt_limit', retryAfterMs: 5_000 });
    expect(speech).toHaveLength(0);
  });

  it.each([
    ['missing', { kind: 'missing' } as RecordingAudio, 'recording_missing'],
    ['pending', { kind: 'pending' } as RecordingAudio, 'recording_not_ready'],
    ['unreadable', new Error('boom'), 'recording_unreadable'],
    ['inaudible', { kind: 'ready', wav: levelledWav([{ ms: 500, dbfs: -48 }, { ms: 2_000, dbfs: -32 }]) } as RecordingAudio, 'recording_inaudible'],
  ])('a %s take fails with no paid call', async (_name, audio, errorCode) => {
    const { run, speech } = setup({ audio });
    expect(await run()).toEqual({ status: 'failed', errorCode, aiCallIds: [] });
    expect(speech).toHaveLength(0);
  });

  it('maps an exhausted pool and a provider error', async () => {
    const pool = setup({ routed: Result.fail({ kind: 'refused', code: 'quota_exhausted' }) });
    expect(await pool.run()).toEqual({ status: 'refused', reason: 'pool_empty', retryAfterMs: null });
    const down = setup({ routed: Result.fail({ kind: 'unavailable' }) });
    expect(await down.run()).toEqual({ status: 'failed', errorCode: 'unavailable', aiCallIds: ['speech-1'] });
  });

  it('keeps the words when the sounds cannot be measured', async () => {
    const sounds = { of: async () => { throw new Error('lexicon down'); } } as unknown as PassageSounds;
    const outcome = await setup({ sounds }).run();
    expect(outcome.status).toBe('ok');
  });
});
