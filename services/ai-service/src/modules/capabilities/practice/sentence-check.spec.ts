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
import type { ISoundSessionLimiter } from '../sound-session/application/ports/sound-session.limiter.js';
import { SOUND_SESSION_SURFACE } from '../sound-session/domain/sound-session.js';
import type { SoundToExplain } from '../pronunciation-explain/domain/sound-explanations.js';
import type { WordSounds } from '../../pronunciation/application/passage-sounds.js';
import type { AlignedSound, WordAlignment } from '../../pronunciation/domain/align-word.js';
import type { SpeechContext } from '../../pronunciation/domain/sound-inventory.js';
import { weakSounds } from '../../pronunciation/domain/weak-sounds.js';

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
  target: null,
  sessionId: null,
  explain: true,
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
    sessionTakeAllowed?: boolean;
    routed?: unknown;
    sounds?: PassageSounds;
    explainer?: SoundExplainer;
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
  const sessionTakes: string[] = [];
  const sessions: ISoundSessionLimiter = {
    begin: async () => ({ allowed: true }),
    take: async (sessionId) => {
      sessionTakes.push(sessionId);
      return over.sessionTakeAllowed ?? true;
    },
  };
  const sounds = over.sounds ?? ({ of: async () => null } as unknown as PassageSounds);
  const handler = new SentenceCheckHandler(gateway, recordings, limiter, sessions, sounds, { explanationLanguage: async () => 'ru' } as ISchoolLanguageReader, over.explainer ?? new SoundExplainer(gateway, { base: async () => [] }));
  return { run: (req = request()) => handler.execute(new SentenceCheckCommand(req)), speech, taken, sessionTakes };
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

  it("a session's take: its own surface and take count, not the sentence's daily tries (step 14.1)", async () => {
    const SESSION = 'd0000000-0000-4000-8000-000000000004';
    const { run, speech, taken, sessionTakes } = setup({ limiter: { allowed: false, retryAfterMs: 5_000 } });
    expect((await run(request({ sessionId: SESSION }))).status).toBe('ok');
    expect(speech[0]!.context.surface).toBe(SOUND_SESSION_SURFACE);
    expect(sessionTakes).toEqual([SESSION]);
    expect(taken).toEqual([]);
  });

  it("refuses a session's take past the session's takes without fetching or calling", async () => {
    const { run, speech } = setup({ sessionTakeAllowed: false, audio: new Error('must not be fetched') });
    expect(await run(request({ sessionId: 'd0000000-0000-4000-8000-000000000004' }))).toEqual({
      status: 'refused',
      reason: 'session_limit',
      retryAfterMs: null,
    });
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

const CARRIER = 'Nå sier jeg kjenne igjen.';
const CARRIER_WORDS = ['Nå', 'sier', 'jeg', 'kjenne', 'igjen'];

/** The carrier frame heard, every word scored. */
const heardCarrier = (): SpeechResult =>
  ({
    words: CARRIER_WORDS.map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250, confidence: 0.9 })),
    pronunciation: {
      accuracy: 80,
      fluency: 0,
      completeness: 100,
      prosody: null,
      words: CARRIER_WORDS.map((text) => ({ text, accuracy: 80, error: 'none', phonemes: [{ startMs: 0, durationMs: 80, accuracy: 80 }] })),
    },
  }) as unknown as SpeechResult;

const named = (symbol: string, accuracy: number): AlignedSound => ({
  symbol,
  symbols: [symbol],
  ipa: symbol.toLowerCase(),
  family: null,
  stress: null,
  primary: false,
  startMs: 0,
  durationMs: 80,
  accuracy,
});

/**
 * Sounds of the carrier as PassageSounds reads it in running speech: *kjenne*'s kj scored `kj`,
 * and *igjen*'s J weak by the fluent reading (an incidental remark: J is not scored, so the weak
 * list is set by hand).
 */
function carrierSounds(kj: number, incidental = false): PassageSounds {
  return {
    of: async (_language: string, _passage: string, _scored: unknown, context: SpeechContext) => {
      expect(context).toBe('fluent');
      return CARRIER_WORDS.map((text): WordSounds => {
        const sounds = text === 'kjenne' ? [named('KJ', kj), named('EH', 90), named('N', 90), named('AX', 90)] : [named('N', 90)];
        const of = (s: AlignedSound[]): WordAlignment => ({ status: 'aligned', text, sounds: s, primaryIndex: null, tone: null, variants: [] });
        const alignment = of(sounds);
        // As if fluent scoring had passed kj: the word context must re-read it.
        const weak = incidental && text === 'igjen' ? weakSounds(of([named('SJ', 5)]), 'fluent', false) : [];
        return { alignment, weak };
      });
    },
  } as unknown as PassageSounds;
}

/** An explainer that explains whatever it is asked, and keeps what it was asked. */
function explaining() {
  const asked: SoundToExplain[][] = [];
  const explainer = {
    explain: async (ask: { sounds: SoundToExplain[] }) => {
      asked.push(ask.sounds);
      return {
        call: { recorded: { callId: `explain-${asked.length}` } },
        explanations: { explanations: ask.sounds.map((f) => `model on ${f.word}`), summary: 'summary' },
      };
    },
  } as unknown as SoundExplainer;
  return { explainer, asked };
}

const kjTarget = (explained: string[] = []): SentenceCheckRequest['target'] => ({
  atomId: 'nb:kj',
  words: ['kjenne'],
  context: 'word',
  explained,
});

describe('SentenceCheckHandler — a session take with a target sound (plan 86, step 13.3)', () => {
  it.each([
    ['the toneme', { atomId: 'nb:tone', words: ['kjenne'], context: 'word' as const, explained: [] }, 'target_not_scored'],
    ['a word not in the sentence', { atomId: 'nb:kj', words: ['kino'], context: 'word' as const, explained: [] }, 'target_not_in_sentence'],
  ])('refuses %s before counting a try or calling', async (_name, target, reason) => {
    const { run, speech, taken } = setup();
    expect(await run(request({ sentence: CARRIER, target }))).toEqual({ status: 'refused', reason, retryAfterMs: null });
    expect(speech).toHaveLength(0);
    expect(taken).toHaveLength(0);
  });

  it('fails the target by the single-word threshold and has the model explain the miss', async () => {
    const { explainer, asked } = explaining();
    const { run } = setup({ routed: Result.ok({ result: heardCarrier() }), sounds: carrierSounds(12), explainer });
    const outcome = await run(request({ sentence: CARRIER, target: kjTarget() }));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.target).toMatchObject({
      atomId: 'nb:kj',
      measured: true,
      passed: false,
      weakest: { word: 'kjenne', accuracy: 12, threshold: 53, severity: 'major', key: 'KJ:major' },
      explained: true,
    });
    expect(asked).toEqual([[expect.objectContaining({ word: 'kjenne', family: 'kj' })]]);
    expect(outcome.feedback.items.find((i) => i.original === 'kjenne')?.explanation).toBe('model on kjenne');
    expect(outcome.aiCallIds).toEqual(['speech-1', 'explain-1']);
  });

  it('does not explain the same miss twice on an element, but still explains a sound beside the target', async () => {
    const { explainer, asked } = explaining();
    const { run } = setup({ routed: Result.ok({ result: heardCarrier() }), sounds: carrierSounds(12, true), explainer });
    const outcome = await run(request({ sentence: CARRIER, target: kjTarget(['KJ:major']) }));
    if (outcome.status !== 'ok') throw new Error(outcome.status);
    expect(outcome.target).toMatchObject({ passed: false, weakest: { key: 'KJ:major' }, explained: false });
    expect(asked).toEqual([[expect.objectContaining({ word: 'igjen', family: 'sj' })]]);
    const byWord = Object.fromEntries(outcome.feedback.items.map((i) => [i.original, i.explanation]));
    expect(byWord['igjen']).toBe('model on igjen');
    expect(byWord['kjenne']).toMatch(/^kj-sound/);
  });

  it("measures without the model when asked not to explain (a session's diagnostic, step 14.2)", async () => {
    const { explainer, asked } = explaining();
    const { run } = setup({ routed: Result.ok({ result: heardCarrier() }), sounds: carrierSounds(12, true), explainer });
    const outcome = await run(request({ sentence: CARRIER, target: kjTarget(), explain: false }));
    if (outcome.status !== 'ok') throw new Error(outcome.status);
    expect(outcome.target).toMatchObject({ measured: true, passed: false, weakest: { key: 'KJ:major' }, explained: false });
    expect(asked).toHaveLength(0);
    expect(outcome.aiCallIds).toEqual(['speech-1']);
    const byWord = Object.fromEntries(outcome.feedback.items.map((i) => [i.original, i.explanation]));
    expect(byWord['kjenne']).toMatch(/^kj-sound/);
    // The remarks still name the sounds heard on the way (step 13.5b reads them).
    expect(outcome.feedback.items.map((i) => i.atomRef?.atomId)).toEqual(expect.arrayContaining(['nb:kj', 'nb:sj']));
  });

  it('explains again when the miss changed', async () => {
    const { explainer, asked } = explaining();
    const { run } = setup({ routed: Result.ok({ result: heardCarrier() }), sounds: carrierSounds(40), explainer });
    const outcome = await run(request({ sentence: CARRIER, target: kjTarget(['KJ:major']) }));
    if (outcome.status !== 'ok') throw new Error(outcome.status);
    expect(outcome.target).toMatchObject({ weakest: { key: 'KJ:minor' }, explained: true });
    expect(asked).toHaveLength(1);
  });

  it('passes the target with no model call when nothing is weak', async () => {
    const { explainer, asked } = explaining();
    const { run } = setup({ routed: Result.ok({ result: heardCarrier() }), sounds: carrierSounds(70), explainer });
    const outcome = await run(request({ sentence: CARRIER, target: kjTarget() }));
    if (outcome.status !== 'ok') throw new Error(outcome.status);
    expect(outcome.target).toMatchObject({ measured: true, passed: true, weakest: { severity: null, key: null }, explained: false });
    expect(asked).toHaveLength(0);
    expect(outcome.aiCallIds).toEqual(['speech-1']);
  });

  it('answers «not measured» when the sounds could not be read, and no target remark is made', async () => {
    const down = { of: async () => { throw new Error('lexicon down'); } } as unknown as PassageSounds;
    const { run } = setup({ routed: Result.ok({ result: heardCarrier() }), sounds: down });
    const outcome = await run(request({ sentence: CARRIER, target: kjTarget() }));
    if (outcome.status !== 'ok') throw new Error(outcome.status);
    expect(outcome.target).toEqual({ atomId: 'nb:kj', measured: false, reason: 'no_sounds', passed: false, weakest: null, explained: false });
  });

  it('a drill take without a target answers no verdict', async () => {
    const { run } = setup({ routed: Result.ok({ result: heardCarrier() }), sounds: carrierSounds(12) });
    const outcome = await run(request({ sentence: CARRIER }));
    if (outcome.status !== 'ok') throw new Error(outcome.status);
    expect(outcome.target).toBeUndefined();
  });
});
