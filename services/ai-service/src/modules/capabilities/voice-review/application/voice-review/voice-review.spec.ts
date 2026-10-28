import type { AiGateway, GatewaySpeechCall } from '../../../../gateway/application/ai-gateway.js';
import type { SpeechGatewayRequest } from '../../../../gateway/application/model-router.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { DraftWriteMeta } from '../../../review-draft/application/ports/review-attempts.client.js';
import { REVIEW_QUEUE_SURFACE } from '../../../review-draft/application/draft-review/draft-review.handler.js';
import { SchoolPayerResolver } from '../../../review-draft/application/school-payer.resolver.js';
import { SELF_STUDY_SURFACE } from '../../../review-direct/application/direct-review/direct-review.handler.js';
import { LearnerPayerResolver } from '../../../review-direct/application/learner-payer.resolver.js';
import type { GiveUpReason } from '../../../review-direct/application/ports/direct-review-attempts.client.js';
import type { ReadAloudSubject, VoiceSubjectResult } from '../../domain/read-aloud-subject.js';
import type { IRecordingAudioSource, RecordingAudio } from '../ports/recording-audio.source.js';
import type { IVoiceReviewAttemptsClient, ReadingToWrite } from '../ports/voice-review-attempts.client.js';
import { VoiceReviewCommand } from './voice-review.command.js';
import { VoiceReviewHandler } from './voice-review.handler.js';

// Plan 82, step 8.

const ATTEMPT = 'a0000000-0000-4000-8000-000000000082';
const LEARNER = 'c8655ecd-0000-4000-8000-000000000001';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

const subjectOf = (over: Partial<ReadAloudSubject> = {}): ReadAloudSubject => ({
  template: 'read_aloud',
  targetLanguage: 'nb',
  passPercent: 85,
  ai: { on: true, checks: { transcript: true, pronunciation: false, fluency: true } },
  prompts: [
    { itemId: 'p1', label: '1', text: 'Jeg bor i Oslo.', focus: [], assetId: 'asset-1', seconds: 3 },
    { itemId: 'p2', label: '2', text: 'Jeg jobber på et kontor.', focus: ['kontor'], assetId: 'asset-2', seconds: 4 },
  ],
  carriedItemIds: [],
  ...over,
});

const subjectResult = (over: Partial<VoiceSubjectResult> = {}, subject = subjectOf()): VoiceSubjectResult => ({
  attemptId: ATTEMPT,
  userId: LEARNER,
  schoolId: null,
  templateCode: 'read_aloud',
  skip: null,
  subject,
  ...over,
});

const BINDING = { promptVersion: 'voice_review@1' };
const modelOf = (n: number) => ({ model: { id: `model-${n}`, providerId: `provider-${n}`, providerModelId: 'fake-speech' } });

let callCounter = 0;
const heard = (transcript: string, model = 1): GatewaySpeechCall =>
  ({
    routed: Result.ok({
      result: { transcript, words: [{ text: 'jeg', startMs: 0, endMs: 300, confidence: null }], pronunciation: null, audioMs: 3_000 },
      model: modelOf(model),
      role: 'primary',
      binding: BINDING,
      attempts: [],
    }),
    recorded: { callId: `call-${++callCounter}`, cost: null, credits: '0' },
    latencyMs: 5,
  }) as unknown as GatewaySpeechCall;

const failedWith = (code: string): GatewaySpeechCall =>
  ({
    routed: Result.fail({ kind: 'error', error: { code, message: code }, model: modelOf(1), role: 'primary', binding: BINDING, raw: null, attempts: [] }),
    recorded: { callId: `call-${++callCounter}`, cost: null, credits: '0' },
    latencyMs: 5,
  }) as unknown as GatewaySpeechCall;

const notRouted = (failure: Record<string, unknown>): GatewaySpeechCall =>
  ({
    routed: Result.fail({ binding: BINDING, attempts: [], ...failure }),
    recorded: { callId: `call-${++callCounter}`, cost: null, credits: '0' },
    latencyMs: 1,
  }) as unknown as GatewaySpeechCall;

const WAV = new Uint8Array([1, 2, 3]);

type Answer<T> = T | 'throws' | { code: string };

interface Setup {
  subject?: VoiceSubjectResult | null;
  /** By capability, in call order; past the list, every prompt is heard as its passage. */
  calls?: Record<string, GatewaySpeechCall[]>;
  available?: boolean;
  /** By asset id, in fetch order; the last one repeats. */
  audio?: Record<string, RecordingAudio[]>;
  put?: Array<Answer<'ok' | 'provisional'>>;
}

function setup({
  subject = subjectResult(),
  calls = {},
  available = false,
  audio = {},
  put = ['ok'],
}: Setup = {}) {
  const asked: Array<{ capability: string; context: CallContext; request: SpeechGatewayRequest }> = [];
  const availability: string[] = [];
  const queues = Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, [...v]]));
  const gateway = {
    callSpeech: async (capability: string, context: CallContext, request: SpeechGatewayRequest) => {
      asked.push({ capability, context, request });
      return queues[capability]?.shift() ?? heard(request.referenceText.toLowerCase());
    },
    available: async (capability: string) => {
      availability.push(capability);
      return available;
    },
  } as unknown as AiGateway;

  const fetched: string[] = [];
  const recordings: IRecordingAudioSource = {
    fetch: async (assetId) => {
      fetched.push(assetId);
      const queue = audio[assetId];
      if (!queue || queue.length === 0) return { kind: 'ready', wav: WAV };
      return queue.length > 1 ? queue.shift()! : queue[0]!;
    },
  };

  const writes: Array<{ reading: ReadingToWrite; meta: DraftWriteMeta }> = [];
  const gaveUp: Array<{ reason: GiveUpReason; aiCallId: string | null }> = [];
  const puts = [...put];
  const attempts: IVoiceReviewAttemptsClient = {
    getSubject: async () => subject,
    putReading: async (_id, reading, meta) => {
      const next = puts.shift() ?? 'ok';
      if (next === 'throws') throw new Error('engine down');
      writes.push({ reading, meta });
      if (next === 'ok') return { written: true, attemptStatus: 'scored', provisional: false };
      if (next === 'provisional') return { written: true, attemptStatus: 'routed_for_review', provisional: true };
      return { written: false, code: next.code };
    },
    giveUp: async (_id, reason, aiCallId) => {
      gaveUp.push({ reason, aiCallId });
      return { closed: true };
    },
  };

  const handler = new VoiceReviewHandler(
    gateway,
    new LearnerPayerResolver(),
    new SchoolPayerResolver(),
    attempts,
    recordings,
    0,
    [0, 0],
  );
  return { handler, asked, availability, fetched, writes, gaveUp };
}

const learnerCommand = () => new VoiceReviewCommand(ATTEMPT, LEARNER, 'read_aloud');
const schoolCommand = () => new VoiceReviewCommand(ATTEMPT, LEARNER, 'read_aloud', SCHOOL);

describe('VoiceReviewHandler', () => {
  it('hears every prompt under the learner’s tariff and sends what was heard — no verdict', async () => {
    const { handler, asked, availability, writes, gaveUp } = setup();
    const outcome = await handler.execute(learnerCommand());

    expect(asked.map((a) => [a.capability, a.request.referenceText, a.request.language, a.request.pronunciation])).toEqual([
      ['voice_review', 'Jeg bor i Oslo.', 'nb', false],
      ['voice_review', 'Jeg jobber på et kontor.', 'nb', false],
    ]);
    expect(asked[0]?.context).toEqual({
      payer: { type: 'user', id: LEARNER },
      actor: { userId: LEARNER, role: null },
      surface: SELF_STUDY_SURFACE,
    });
    expect(asked[0]?.request.audio).toEqual({ format: 'wav', data: WAV });
    // The author did not ask for pronunciation: the premium level is not even looked at.
    expect(availability).toEqual([]);

    expect(writes).toHaveLength(1);
    const { reading, meta } = writes[0]!;
    expect(reading.status).toBe('ready');
    if (reading.status !== 'ready') return;
    expect(reading.prompts.map((p) => [p.itemId, p.transcript, p.audioMs])).toEqual([
      ['p1', 'jeg bor i oslo.', 3_000],
      ['p2', 'jeg jobber på et kontor.', 3_000],
    ]);
    expect(meta).toMatchObject({ providerId: 'provider-1', modelId: 'model-1', promptVersion: 'voice_review@1' });
    // Each prompt names the call that heard it; the review is written under the first one.
    const ids = reading.prompts.map((p) => p.aiCallId);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe(meta.aiCallId);
    expect(outcome).toMatchObject({ kind: 'ruled', attemptStatus: 'scored', provisional: false, capability: 'voice_review' });
    if (outcome.kind === 'ruled') expect(outcome.aiCallIds[0]).toBe(meta.aiCallId);
    expect(gaveUp).toEqual([]);
  });

  it('asks the pronunciation level when the author wants it and the payer may call it', async () => {
    const withPronunciation = subjectResult({}, subjectOf({ ai: { on: true, checks: { transcript: true, pronunciation: true, fluency: false } } }));
    const { handler, asked, availability } = setup({ subject: withPronunciation, available: true });
    const outcome = await handler.execute(learnerCommand());
    expect(availability).toEqual(['voice_review_pronunciation']);
    expect(asked.map((a) => [a.capability, a.request.pronunciation])).toEqual([
      ['voice_review_pronunciation', true],
      ['voice_review_pronunciation', true],
    ]);
    expect(outcome).toMatchObject({ kind: 'ruled', capability: 'voice_review_pronunciation' });
  });

  it('hears plainly when the payer may not call the pronunciation level', async () => {
    const withPronunciation = subjectResult({}, subjectOf({ ai: { on: true, checks: { transcript: true, pronunciation: true, fluency: false } } }));
    const { handler, asked } = setup({ subject: withPronunciation, available: false });
    await handler.execute(learnerCommand());
    expect(asked.map((a) => a.capability)).toEqual(['voice_review', 'voice_review']);
  });

  it('drops to the plain level when the pronunciation call is refused — its credits spent', async () => {
    const withPronunciation = subjectResult({}, subjectOf({ ai: { on: true, checks: { transcript: true, pronunciation: true, fluency: false } } }));
    const { handler, asked, writes } = setup({
      subject: withPronunciation,
      available: true,
      calls: { voice_review_pronunciation: [notRouted({ kind: 'refused', code: 'quota_exhausted' })] },
    });
    const outcome = await handler.execute(learnerCommand());
    expect(asked.map((a) => a.capability)).toEqual(['voice_review_pronunciation', 'voice_review', 'voice_review']);
    expect(writes[0]?.reading.status).toBe('ready');
    expect(outcome).toMatchObject({ kind: 'ruled', capability: 'voice_review' });
    if (outcome.kind !== 'ruled' || writes[0]?.reading.status !== 'ready') return;
    // The refused pronunciation call heard nothing: the first prompt names the plain call after it.
    expect(writes[0].reading.prompts.map((p) => p.aiCallId)).toEqual(outcome.aiCallIds);
  });

  it.each([
    ['refused by the gate', notRouted({ kind: 'refused', code: 'not_entitled' }), 'refused', 'not_entitled'],
    ['switched off', notRouted({ kind: 'disabled' }), 'refused', 'disabled'],
    ['with every model skipped', notRouted({ kind: 'unavailable' }), 'failed', 'unavailable'],
  ])('gives the learner’s reading up when %s, writing nothing', async (_label, call, reason, cause) => {
    const { handler, writes, gaveUp } = setup({ calls: { voice_review: [call] } });
    const outcome = await handler.execute(learnerCommand());
    expect(writes).toEqual([]);
    expect(gaveUp).toEqual([{ reason, aiCallId: expect.any(String) }]);
    expect(outcome).toMatchObject({ kind: 'gave_up', reason, cause, engine: 'closed' });
  });

  it('stores a failed review when a model failed mid-reading, then gives up — the rest is not heard', async () => {
    const { handler, asked, writes, gaveUp } = setup({ calls: { voice_review: [heard('jeg bor i oslo'), failedWith('timeout')] } });
    const outcome = await handler.execute(learnerCommand());
    expect(asked).toHaveLength(2);
    expect(writes.map((w) => w.reading)).toEqual([{ status: 'failed', errorCode: 'timeout' }]);
    expect(gaveUp).toEqual([{ reason: 'failed', aiCallId: writes[0]!.meta.aiCallId }]);
    expect(outcome).toMatchObject({ kind: 'gave_up', reason: 'failed', cause: 'timeout' });
  });

  it('waits for a take media is still converting', async () => {
    const { handler, fetched, writes } = setup({
      audio: { 'asset-2': [{ kind: 'pending' }, { kind: 'ready', wav: WAV }] },
    });
    const outcome = await handler.execute(learnerCommand());
    expect(fetched).toEqual(['asset-1', 'asset-2', 'asset-2']);
    expect(writes[0]?.reading.status).toBe('ready');
    expect(outcome.kind).toBe('ruled');
  });

  it.each([
    ['still converted after every wait', [{ kind: 'pending' } as RecordingAudio], 'recording_not_ready'],
    ['missing', [{ kind: 'missing' } as RecordingAudio], 'recording_missing'],
  ])('gives up before any model when a take is %s', async (_label, takes, cause) => {
    const { handler, asked, gaveUp } = setup({ audio: { 'asset-1': takes } });
    const outcome = await handler.execute(learnerCommand());
    expect(asked).toEqual([]);
    expect(gaveUp).toEqual([{ reason: 'failed', aiCallId: null }]);
    expect(outcome).toMatchObject({ kind: 'gave_up', cause });
  });

  it('gives up as unaskable when the machine may not check the reading', async () => {
    const off = subjectResult({}, subjectOf({ ai: { on: false, checks: { transcript: false, pronunciation: false, fluency: false } } }));
    const { handler, asked, fetched, gaveUp } = setup({ subject: off });
    const outcome = await handler.execute(learnerCommand());
    expect(asked).toEqual([]);
    expect(fetched).toEqual([]);
    expect(gaveUp).toEqual([{ reason: 'unaskable', aiCallId: null }]);
    expect(outcome).toMatchObject({ kind: 'gave_up', cause: 'machine_cannot_check' });
  });

  it.each([
    ['TEMPLATE_NOT_SUPPORTED', 'unaskable'],
    ['EXERCISE_GONE', 'unaskable'],
    ['DRAFT_EXISTS', 'failed'],
  ])('closes a learner’s reading the engine skips as %s', async (skip, reason) => {
    const { handler, asked, gaveUp } = setup({ subject: subjectResult({ skip, subject: null }) });
    await handler.execute(learnerCommand());
    expect(asked).toEqual([]);
    expect(gaveUp).toEqual([{ reason, aiCallId: null }]);
  });

  it('only skips a reading decided meanwhile', async () => {
    const { handler, gaveUp } = setup({ subject: subjectResult({ skip: 'ATTEMPT_NOT_IN_REVIEW', subject: null }) });
    expect(await handler.execute(learnerCommand())).toEqual({ kind: 'skipped', reason: 'attempt_not_in_review' });
    expect(gaveUp).toEqual([]);
  });

  it('gives up when the reading cannot be written, or the engine refuses it', async () => {
    const lost = setup({ put: ['throws', 'throws'] });
    expect(await lost.handler.execute(learnerCommand())).toMatchObject({ kind: 'gave_up', cause: 'reading_write_lost' });

    const refused = setup({ put: [{ code: 'VERDICT_INCOMPLETE' }] });
    expect(await refused.handler.execute(learnerCommand())).toMatchObject({ kind: 'gave_up', cause: 'engine_verdict_incomplete' });

    const retried = setup({ put: ['throws', 'ok'] });
    expect(await retried.handler.execute(learnerCommand())).toMatchObject({ kind: 'ruled' });
  });

  describe('at a school that has a model answer first (plan 80)', () => {
    const schools = subjectResult({ schoolId: SCHOOL });

    it('is heard with the school as payer, on the review queue, and the verdict waits for the teacher', async () => {
      const { handler, asked } = setup({ subject: schools, put: ['provisional'] });
      const outcome = await handler.execute(schoolCommand());
      expect(asked[0]?.context.payer).toEqual({ type: 'workspace', id: SCHOOL });
      expect(asked[0]?.context.surface).toBe(REVIEW_QUEUE_SURFACE);
      expect(outcome).toMatchObject({ kind: 'ruled', provisional: true });
    });

    it('is left to the teacher — not closed — when nothing was heard', async () => {
      const { handler, gaveUp } = setup({ subject: schools, calls: { voice_review: [notRouted({ kind: 'refused', code: 'not_entitled' })] } });
      expect(await handler.execute(schoolCommand())).toMatchObject({ kind: 'left_to_teacher', cause: 'not_entitled' });
      expect(gaveUp).toEqual([]);
    });

    it('skips an event whose school is not the attempt’s', async () => {
      const { handler, asked } = setup({ subject: schools });
      expect(await handler.execute(learnerCommand())).toEqual({ kind: 'skipped', reason: 'school_differs_from_event' });
      expect(asked).toEqual([]);
    });
  });
});
