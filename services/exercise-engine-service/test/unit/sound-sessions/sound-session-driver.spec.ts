import { jest } from '@jest/globals';
import { Result } from '../../../src/shared/kernel/result.js';
import { ProbeTask } from '../../../src/modules/probes/domain/entities/probe-task.entity.js';
import { SoundSessionLoader } from '../../../src/modules/sound-sessions/application/session-loader.js';
import { RecordSoundTakeHandler } from '../../../src/modules/sound-sessions/application/commands/record-sound-take/record-sound-take.handler.js';
import { RecordSoundTakeCommand } from '../../../src/modules/sound-sessions/application/commands/record-sound-take/record-sound-take.command.js';
import { SubmitSoundSessionHandler } from '../../../src/modules/sound-sessions/application/commands/submit-sound-session/submit-sound-session.handler.js';
import { SubmitSoundSessionCommand } from '../../../src/modules/sound-sessions/application/commands/submit-sound-session/submit-sound-session.command.js';
import {
  GetSoundSessionItemsHandler,
  instructionFor,
} from '../../../src/modules/sound-sessions/application/queries/get-sound-session-items/get-sound-session-items.handler.js';
import { GetSoundSessionItemsQuery } from '../../../src/modules/sound-sessions/application/queries/get-sound-session-items/get-sound-session-items.query.js';
import { SubmitAnswerCommand } from '../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import {
  SoundSessionSourceError,
  type SoundBaseText,
  type SoundTakeOutcome,
  type TonemeTakeOutcome,
} from '../../../src/modules/sound-sessions/application/ports/sound-session.ports.js';
import { planSession, type SessionPlan } from '../../../src/modules/sound-sessions/domain/session-plan.js';
import { startState, type SessionState } from '../../../src/modules/sound-sessions/domain/session-step.js';
import { toContent } from '../../../src/modules/sound-sessions/domain/sound-session-template.js';
import type { MediaAssetDescription } from '../../../src/shared/application/ports/media-assets.port.js';
import { first, material, noRecord } from './fixtures.js';
import { SoundSessionPayer } from '../../../src/modules/sound-sessions/application/session-payer.js';

const USER = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = 'attempt-1';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const TAKE = 'take-1';

// Under `first` the shuffle puts kj's words as kino, kjøpe, kjenne; the diagnostic takes the
// material's own first word (kjenne).
const plans = {
  diagnostic: () => planSession({ material: material(), learner: noRecord, rand: first }) as SessionPlan,
  kj: () => planSession({ material: material(), learner: noRecord, chosen: 'nb:kj', rand: first }) as SessionPlan,
  tone: () => planSession({ material: material(), learner: noRecord, chosen: 'nb:tone', rand: first }) as SessionPlan,
};

function probeOf(plan: SessionPlan, expired = false): ProbeTask {
  return ProbeTask.create({
    userId: USER,
    subject: { atomType: 'sound', atomId: 'nb:kj' },
    requiredModality: 'production',
    definition: {
      templateCode: 'sound_session',
      targetLanguage: plan.language,
      difficultyLevel: 'A1',
      content: toContent(plan),
      expectedAnswers: null,
      answerCheckSettings: null,
      instruction: null,
    },
    ttlSeconds: expired ? 1 : 3600,
    now: expired ? new Date(Date.now() - 10_000) : new Date(),
  });
}

function attemptOf(probe: ProbeTask, state: SessionState, over: { status?: string; userId?: string; schoolId?: string | null } = {}) {
  let stored: unknown = state;
  return {
    id: ATTEMPT,
    exerciseId: probe.id,
    userId: over.userId ?? USER,
    schoolId: over.schoolId ?? null,
    containerId: null,
    groupId: null,
    itemTargets: [],
    templateCode: 'sound_session',
    status: over.status ?? 'IN_PROGRESS',
    get sessionState() {
      return stored;
    },
    recordSessionState: jest.fn((s: unknown) => {
      stored = s;
      return Result.ok<void, Error>();
    }),
  };
}

const recording = (over: Partial<MediaAssetDescription> = {}): MediaAssetDescription => ({
  id: TAKE,
  ownerId: USER,
  entityType: 'submission_recording',
  entityId: ATTEMPT,
  status: 'READY',
  mimeType: 'audio/webm',
  sizeBytes: 1000,
  durationMs: 2100,
  ...over,
});

const passedTarget = (atomId: string): SoundTakeOutcome => ({
  status: 'ok',
  feedback: { passages: [] } as any,
  target: {
    atomId,
    measured: true,
    passed: true,
    weakest: { word: 'kjenne', symbols: ['KJ'], ipa: 'ç', accuracy: 80, threshold: 53, severity: null, key: null },
    explained: false,
  },
  aiCallIds: ['c1'],
});

const missedTarget = (atomId: string, explained = true): SoundTakeOutcome => ({
  status: 'ok',
  feedback: { passages: [] } as any,
  target: {
    atomId,
    measured: true,
    passed: false,
    weakest: { word: 'kjenne', symbols: ['KJ'], ipa: 'ç', accuracy: 12, threshold: 53, severity: 'major', key: 'KJ:major' },
    explained,
  },
  aiCallIds: ['c1'],
});

function setup(opts: {
  plan: SessionPlan;
  state?: SessionState;
  status?: string;
  expired?: boolean;
  media?: MediaAssetDescription[] | 'down';
  sounds?: SoundTakeOutcome | 'down';
  toneme?: TonemeTakeOutcome;
  base?: SoundBaseText[] | 'down';
  schoolId?: string;
  precheck?: { enabled: boolean } | 'down';
}) {
  const probe = probeOf(opts.plan, opts.expired);
  const attempt = attemptOf(probe, opts.state ?? startState(opts.plan), { status: opts.status, schoolId: opts.schoolId });
  const attempts = {
    findById: jest.fn(async (id: string) => (id === ATTEMPT ? attempt : null)),
    save: jest.fn(async () => undefined),
  };
  const probes = { findById: jest.fn(async (id: string) => (id === probe.id ? probe : null)) };
  const loader = new SoundSessionLoader(attempts as any, probes as any);
  const judge = {
    sounds: jest.fn(async () =>
      opts.sounds === 'down'
        ? Result.fail(new SoundSessionSourceError('ai', 503, 'away'))
        : Result.ok(opts.sounds ?? passedTarget('nb:kj')),
    ),
    toneme: jest.fn(async () => Result.ok(opts.toneme!)),
  };
  const discarder = { discard: jest.fn(async () => true) };
  const media = {
    describe: jest.fn(async () =>
      opts.media === 'down' ? Result.fail(new Error('away') as any) : Result.ok(opts.media ?? [recording()]),
    ),
    playback: jest.fn(async (ids: string[]) =>
      Result.ok(ids.map((id) => ({ id, url: `https://s3/${id}`, mimeType: 'audio/mpeg', expiresAt: 'soon', durationMs: 900 }))),
    ),
  };
  const drill = {
    read: jest.fn(),
    base: jest.fn(async () =>
      opts.base === 'down'
        ? Result.fail(new SoundSessionSourceError('content', 503, 'away'))
        : Result.ok(opts.base ?? [baseOf('nb:kj')]),
    ),
  };
  const settings = {
    schoolAiPrecheck: jest.fn(async () => {
      if (opts.precheck === 'down') throw new Error('organization away');
      return { enabled: opts.precheck?.enabled ?? true, perExerciseLimit: null, perLearnerMonthlyCredits: null };
    }),
  };
  const payers = new SoundSessionPayer({} as any, settings as any);
  const take = new RecordSoundTakeHandler(loader, attempts as any, judge as any, discarder, payers, media as any);
  const items = new GetSoundSessionItemsHandler(loader, drill as any, media as any);
  return { take, items, attempt, attempts, judge, discarder, media, drill, probe };
}

const baseOf = (atomId: string): SoundBaseText => ({
  atomId,
  locale: 'ru',
  title: 'Звук kj',
  description: null,
  howTo: 'Кончик языка за нижними зубами…',
  drill: 'Скажите «хи» шёпотом…',
  commonError: 'Говорят [x] или [ш]',
  ukNote: 'В украинском нет [ç]',
});

const takeOf = (index = 0, lang: string | null = 'ru') => new RecordSoundTakeCommand(ATTEMPT, USER, TAKE, index, lang);

describe('RecordSoundTakeHandler — a take judged by its sound', () => {
  it('a word of the drill: its carrier frame, the target, the session moves and the take is deleted', async () => {
    const s = setup({ plan: plans.kj() });
    const result = await s.take.execute(takeOf());

    expect(result.isOk).toBe(true);
    expect(s.judge.sounds).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: null,
        userId: USER,
        sessionId: ATTEMPT,
        language: 'nb',
        explanationLanguage: 'ru',
        sentence: 'Nå sier jeg kino igjen.',
        recordingAssetId: TAKE,
        target: { atomId: 'nb:kj', words: ['kino'], context: 'word', explained: [] },
        explain: true,
      }),
    );
    expect(result.value).toMatchObject({
      outcome: 'judged',
      reason: null,
      verdict: { measured: true, passed: true, key: null },
      events: [{ kind: 'element_passed', atomId: 'nb:kj' }],
      session: { takes: 1, takeIndex: 1, step: { phase: 'drill', element: { kind: 'word', word: 'kjøpe' }, sentence: 'Nå sier jeg kjøpe igjen.' } },
    });
    expect(s.attempt.recordSessionState).toHaveBeenCalledTimes(1);
    expect(s.attempts.save).toHaveBeenCalledTimes(1);
    expect(s.discarder.discard).toHaveBeenCalledWith(TAKE, USER);
  });

  it('an explained miss is sent back on the next take of the element, so the model is not asked again', async () => {
    const s = setup({ plan: plans.kj(), sounds: missedTarget('nb:kj') });
    const first = await s.take.execute(takeOf(0));
    expect(first.value).toMatchObject({ verdict: { measured: true, passed: false, key: 'KJ:major' }, events: [{ kind: 'retry' }] });

    await s.take.execute(takeOf(1));
    expect(s.judge.sounds).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ explained: ['KJ:major'] }) }),
    );
  });

  it('a course line is said as written and judged on its carriers in running speech', async () => {
    const plan = plans.kj();
    const s0 = setup({ plan });
    await s0.take.execute(takeOf(0));
    await s0.take.execute(takeOf(1));
    await s0.take.execute(takeOf(2));
    expect(s0.judge.sounds).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sentence: 'Jeg kjenner ham.',
        target: { atomId: 'nb:kj', words: ['kjenner'], context: 'fluent', explained: [] },
      }),
    );
  });

  it('the diagnostic: a word in its frame, judged by the `word` thresholds, measured without the model (step 14.2)', async () => {
    const s = setup({ plan: plans.diagnostic(), sounds: missedTarget('nb:kj') });
    const result = await s.take.execute(takeOf());
    expect(s.judge.sounds).toHaveBeenCalledWith(
      expect.objectContaining({
        sentence: 'Nå sier jeg kjenne igjen.',
        target: { atomId: 'nb:kj', words: ['kjenne'], context: 'word', explained: [] },
        explain: false,
      }),
    );
    expect(result.value).toMatchObject({
      events: [{ kind: 'diagnostic_measured', atomId: 'nb:kj', weak: true }],
      session: { phase: 'diagnostic', takes: 0, takeIndex: 1, diagnostic: { measured: 1 } },
    });
  });

  it('a take not measured counts, is deleted, and leaves the element as it was', async () => {
    const s = setup({
      plan: plans.kj(),
      sounds: { status: 'failed', errorCode: 'recording_inaudible', aiCallIds: [] },
    });
    const result = await s.take.execute(takeOf());
    expect(result.value).toMatchObject({
      outcome: 'judged',
      verdict: { measured: false, passed: null, key: null },
      session: { takes: 1, step: { element: { kind: 'word', word: 'kino' }, fails: 0 } },
    });
    expect(s.discarder.discard).toHaveBeenCalled();
  });
});

describe('RecordSoundTakeHandler — sounds heard on the way (step 13.5b)', () => {
  const remark = (atomId: string) => ({ atomRef: { atomType: 'sound', atomId } });

  it('the other sounds the remarks named are kept on the state; the target is not', async () => {
    const outcome = passedTarget('nb:kj');
    const s = setup({
      plan: plans.kj(),
      sounds: { ...outcome, feedback: { passages: [], items: [remark('nb:kj'), remark('nb:r'), { atomRef: null }] } as any },
    });
    await s.take.execute(takeOf());
    expect((s.attempt.sessionState as SessionState).incidental).toEqual(['nb:r']);
  });

  it('a take that judged nothing notes nothing', async () => {
    const s = setup({ plan: plans.kj(), sounds: 'down' });
    await s.take.execute(takeOf());
    expect(s.attempt.recordSessionState).not.toHaveBeenCalled();
  });
});

describe('RecordSoundTakeHandler — who pays (step 14.1, Q32)', () => {
  it("the learner's school when its checks are on", async () => {
    const s = setup({ plan: plans.kj(), schoolId: SCHOOL, precheck: { enabled: true } });
    await s.take.execute(takeOf());
    expect(s.judge.sounds).toHaveBeenCalledWith(expect.objectContaining({ schoolId: SCHOOL, sessionId: ATTEMPT }));
  });

  it('the learner on their own plan when the school switched its checks off', async () => {
    const s = setup({ plan: plans.kj(), schoolId: SCHOOL, precheck: { enabled: false } });
    await s.take.execute(takeOf());
    expect(s.judge.sounds).toHaveBeenCalledWith(expect.objectContaining({ schoolId: null }));
  });
});

describe('RecordSoundTakeHandler — nothing judged, or the session stops', () => {
  it.each([
    ['ai-service away', { sounds: 'down' as const }, 'ai_unavailable'],
    ['the daily limit of a sentence', { sounds: { status: 'refused', reason: 'attempt_limit', retryAfterMs: 1000 } as SoundTakeOutcome }, 'attempt_limit'],
    ['a recording still uploading', { media: [recording({ status: 'PROCESSING', durationMs: null })] }, 'recording_not_ready'],
  ])('%s → retry: no state written, the take kept', async (_name, over, reason) => {
    const s = setup({ plan: plans.kj(), ...over });
    const result = await s.take.execute(takeOf());
    expect(result.value).toMatchObject({ outcome: 'retry', reason, verdict: null, events: [], session: { takes: 0, takeIndex: 0 } });
    expect(s.attempt.recordSessionState).not.toHaveBeenCalled();
    expect(s.discarder.discard).not.toHaveBeenCalled();
  });

  it('pool_empty → the session is done with what it measured; the take is deleted', async () => {
    const s = setup({ plan: plans.kj(), sounds: { status: 'refused', reason: 'pool_empty', retryAfterMs: null } });
    const result = await s.take.execute(takeOf());
    expect(result.value).toMatchObject({
      outcome: 'stopped',
      reason: 'pool_empty',
      events: [{ kind: 'session_done', reason: 'pool_empty' }],
      session: { phase: 'done', doneReason: 'pool_empty', step: null },
    });
    expect(s.discarder.discard).toHaveBeenCalled();
  });

  it('organization-service away: who pays is unknown → retry, nothing judged (step 14.1)', async () => {
    const s = setup({ plan: plans.kj(), schoolId: SCHOOL, precheck: 'down' });
    const result = await s.take.execute(takeOf());
    expect(result.value).toMatchObject({ outcome: 'retry', reason: 'payer_unknown' });
    expect(s.judge.sounds).not.toHaveBeenCalled();
    expect(s.discarder.discard).not.toHaveBeenCalled();
  });

  it("ai-service's take limit of a session (step 14.1) stops it as the take limit", async () => {
    const s = setup({ plan: plans.kj(), sounds: { status: 'refused', reason: 'session_limit', retryAfterMs: null } });
    const result = await s.take.execute(takeOf());
    expect(result.value).toMatchObject({
      outcome: 'stopped',
      reason: 'take_limit',
      session: { phase: 'done', doneReason: 'take_limit' },
    });
    expect(s.discarder.discard).toHaveBeenCalled();
  });

  it('not_available stops it too, under its own reason', async () => {
    const s = setup({ plan: plans.kj(), sounds: { status: 'refused', reason: 'not_available', retryAfterMs: null } });
    const result = await s.take.execute(takeOf());
    expect(result.value).toMatchObject({ outcome: 'stopped', session: { doneReason: 'not_available' } });
  });
});

describe('RecordSoundTakeHandler — a toneme take', () => {
  it('each word of the pair against its own reference; the melody comes back to be drawn', async () => {
    const plan = plans.tone();
    const toneme: TonemeTakeOutcome = {
      status: 'ok',
      word: 'jente',
      sentence: 'Nå sier jeg jente igjen.',
      accuracy: 90,
      comparison: { tone: 2, gap: 0.1, verdict: { kind: 'like_reference' } },
      melody: { stepMs: 10, learner: [100, 110], reference: [100, 112] },
      aiCallIds: [],
    };
    const s = setup({ plan, toneme });
    const result = await s.take.execute(takeOf());
    expect(s.judge.toneme).toHaveBeenCalledWith({
      schoolId: null,
      userId: USER,
      sessionId: ATTEMPT,
      exerciseId: s.attempt.exerciseId,
      language: 'nb',
      word: 'jente',
      recordingAssetId: TAKE,
      referenceAssetId: 'asset-jente',
    });
    expect(s.judge.sounds).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({
      outcome: 'judged',
      verdict: { measured: true, passed: true },
      feedback: null,
      toneme: { tone: 2, verdict: { kind: 'like_reference' }, melody: { stepMs: 10 } },
      session: { step: { element: { kind: 'pair', words: ['fisken', 'fiske'] }, say: 'fisken', sentence: 'Nå sier jeg fisken igjen.' } },
    });

    await s.take.execute(takeOf(1));
    expect(s.judge.toneme).toHaveBeenLastCalledWith(expect.objectContaining({ word: 'fisken', referenceAssetId: 'asset-fisken' }));
  });
});

describe('RecordSoundTakeHandler — refusals', () => {
  it('a take for a step the session has left → STALE_TAKE with the current index; nothing judged', async () => {
    const s = setup({ plan: plans.kj() });
    const result = await s.take.execute(takeOf(3));
    expect(result.error).toEqual({ code: 'STALE_TAKE', takeIndex: 0 });
    expect(s.media.describe).not.toHaveBeenCalled();
    expect(s.judge.sounds).not.toHaveBeenCalled();
  });

  it.each([
    ['another learner', recording({ ownerId: 'someone-else' })],
    ['another attempt', recording({ entityId: 'attempt-2' })],
    ['not a recording', recording({ entityType: 'lesson_audio' })],
  ])('a recording of %s → RECORDING_NOT_FOUND, never sent to ai-service', async (_name, rec) => {
    const s = setup({ plan: plans.kj(), media: [rec] });
    const result = await s.take.execute(takeOf());
    expect(result.error).toEqual({ code: 'RECORDING_NOT_FOUND' });
    expect(s.judge.sounds).not.toHaveBeenCalled();
  });

  it('a refused upload → RECORDING_FAILED; media-service away → MEDIA_UNAVAILABLE', async () => {
    expect((await setup({ plan: plans.kj(), media: [recording({ status: 'FAILED' })] }).take.execute(takeOf())).error).toEqual({
      code: 'RECORDING_FAILED',
    });
    expect((await setup({ plan: plans.kj(), media: 'down' }).take.execute(takeOf())).error).toEqual({ code: 'MEDIA_UNAVAILABLE' });
  });

  it.each([
    ['handed in', { status: 'SCORED' }],
    ['expired', { expired: true }],
  ])('a session %s → SESSION_CLOSED', async (_name, over) => {
    const result = await setup({ plan: plans.kj(), ...over }).take.execute(takeOf());
    expect(result.error).toEqual({ code: 'SESSION_CLOSED' });
  });

  it("another learner's session reads as no session at all", async () => {
    const s = setup({ plan: plans.kj() });
    const result = await s.take.execute(new RecordSoundTakeCommand(ATTEMPT, 'someone-else', TAKE, 0, null));
    expect(result.error).toEqual({ code: 'SESSION_NOT_FOUND' });
  });
});

describe('GetSoundSessionItemsHandler', () => {
  it('a word: its clip as a link and the base in the reader’s locale', async () => {
    const s = setup({ plan: plans.kj() });
    const result = await s.items.execute(new GetSoundSessionItemsQuery(ATTEMPT, USER, 'ru'));
    expect(result.value).toMatchObject({
      session: { step: { element: { kind: 'word', word: 'kino' }, sentence: 'Nå sier jeg kino igjen.' } },
      clips: [{ word: 'kino', url: 'https://s3/asset-kino' }],
      instruction: { atomId: 'nb:kj', howTo: expect.any(String), commonError: 'Говорят [x] или [ш]', ukNote: null },
    });
    expect(s.drill.base).toHaveBeenCalledWith('nb', 'ru');
  });

  it('a pair: both clips', async () => {
    const plan = plans.tone();
    const state = startState(plan);
    state.sounds[0]!.at = 1;
    state.sounds[0]!.elements.push({ side: 0, takes: 0, fails: 0, explained: [], status: 'open' });
    const s = setup({ plan, state, base: [] });
    const result = await s.items.execute(new GetSoundSessionItemsQuery(ATTEMPT, USER, 'en'));
    expect(result.value?.clips.map((c) => c.word)).toEqual(['fisken', 'fiske']);
    expect(result.value?.instruction).toBeNull();
  });

  it('the diagnostic: the clip, but no instruction — it measures cold', async () => {
    const s = setup({ plan: plans.diagnostic() });
    const result = await s.items.execute(new GetSoundSessionItemsQuery(ATTEMPT, USER, 'uk'));
    expect(result.value).toMatchObject({ clips: [{ word: 'kjenne' }], instruction: null });
    expect(s.drill.base).not.toHaveBeenCalled();
  });

  it('content-service away: the step still comes, without the instruction', async () => {
    const s = setup({ plan: plans.kj(), base: 'down' });
    const result = await s.items.execute(new GetSoundSessionItemsQuery(ATTEMPT, USER, 'ru'));
    expect(result.value).toMatchObject({ clips: [{ word: 'kino' }], instruction: null });
  });

  it('a handed-in session has no step', async () => {
    const s = setup({ plan: plans.kj(), status: 'SCORED' });
    const result = await s.items.execute(new GetSoundSessionItemsQuery(ATTEMPT, USER, 'ru'));
    expect(result.value).toMatchObject({ session: { step: null }, clips: [], instruction: null });
  });

  it('instructionFor: commonError for ru/uk readers, ukNote for uk only', () => {
    const base = baseOf('nb:kj');
    expect(instructionFor(base, 'en')).toMatchObject({ commonError: null, ukNote: null });
    expect(instructionFor(base, 'ru-RU')).toMatchObject({ commonError: base.commonError, ukNote: null });
    expect(instructionFor(base, 'uk')).toMatchObject({ commonError: base.commonError, ukNote: base.ukNote });
  });
});

describe('SubmitSoundSessionHandler', () => {
  function submitSetup(state?: SessionState, status?: string) {
    const plan = plans.kj();
    const s = setup({ plan, state, status });
    const commandBus = {
      execute: jest.fn(async (c: unknown) => {
        if (c instanceof SubmitAnswerCommand) return Result.ok({ attemptId: ATTEMPT, correct: false, score: 0, requiresReview: false, feedback: { summary: '' } });
        throw new Error('unexpected command');
      }),
    };
    const publisher = { publish: jest.fn(async () => undefined) };
    const handler = new SubmitSoundSessionHandler(
      commandBus as any,
      new SoundSessionLoader(s.attempts as any, { findById: async () => s.probe } as any),
      s.attempts as any,
      publisher as any,
    );
    return { ...s, handler, commandBus, publisher };
  }

  it('weak sounds the session did not rate go out as one ai_session letter after the hand-in', async () => {
    const s = submitSetup({ ...startState(plans.kj()), incidental: ['nb:r', 'nb:y'] });
    const result = await s.handler.execute(new SubmitSoundSessionCommand(ATTEMPT, USER, 'ru'));

    expect(result.value).toMatchObject({ flagged: ['nb:r', 'nb:y'] });
    expect(s.publisher.publish).toHaveBeenCalledTimes(1);
    expect(s.publisher.publish).toHaveBeenCalledWith(
      'exercise.feedback.atoms_flagged',
      expect.objectContaining({
        userId: USER,
        attemptId: ATTEMPT,
        templateCode: 'sound_session',
        source: 'ai_session',
        atoms: [
          { atomType: 'sound', atomId: 'nb:r', inExerciseTargets: false },
          { atomType: 'sound', atomId: 'nb:y', inExerciseTargets: false },
        ],
      }),
    );
  });

  it('nothing weak and unrated — no letter', async () => {
    const s = submitSetup();
    const result = await s.handler.execute(new SubmitSoundSessionCommand(ATTEMPT, USER, 'ru'));
    expect(result.value).toMatchObject({ flagged: [] });
    expect(s.publisher.publish).not.toHaveBeenCalled();
  });

  it('a broker away loses the letter, not the hand-in', async () => {
    const s = submitSetup({ ...startState(plans.kj()), incidental: ['nb:r'] });
    s.publisher.publish.mockRejectedValueOnce(new Error('broker away') as never);
    const result = await s.handler.execute(new SubmitSoundSessionCommand(ATTEMPT, USER, 'ru'));
    expect(result.isOk).toBe(true);
  });

  it('a refused hand-in flags nothing', async () => {
    const s = submitSetup({ ...startState(plans.kj()), incidental: ['nb:r'] });
    s.commandBus.execute.mockImplementationOnce(async () => Result.fail({ code: 'PROBE_EXPIRED' }) as never);
    const result = await s.handler.execute(new SubmitSoundSessionCommand(ATTEMPT, USER, 'ru'));
    expect(result.error).toMatchObject({ code: 'SUBMIT_FAILED' });
    expect(s.publisher.publish).not.toHaveBeenCalled();
  });

  it('an open session is stopped where it stands, then handed in with the recorded state', async () => {
    const s = submitSetup();
    const result = await s.handler.execute(new SubmitSoundSessionCommand(ATTEMPT, USER, 'ru'));

    expect(result.isOk).toBe(true);
    const submitted = s.commandBus.execute.mock.calls[0]![0] as SubmitAnswerCommand;
    expect(submitted).toBeInstanceOf(SubmitAnswerCommand);
    expect(submitted.submittedAnswer).toEqual({ state: expect.objectContaining({ phase: 'done', doneReason: 'stopped' }) });
    expect(s.attempt.recordSessionState).toHaveBeenCalledTimes(1);
    expect(result.value).toMatchObject({
      doneReason: 'stopped',
      sounds: [{ atomId: 'nb:kj', status: 'open', rating: null }],
      session: { phase: 'done', step: null },
    });
  });

  it('a done session is handed in as it is', async () => {
    const plan = plans.kj();
    const done: SessionState = { ...startState(plan), phase: 'done', doneReason: 'take_limit' };
    const s = submitSetup(done);
    const result = await s.handler.execute(new SubmitSoundSessionCommand(ATTEMPT, USER, 'ru'));
    expect(s.attempt.recordSessionState).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({ doneReason: 'take_limit' });
  });

  it('a session already handed in → SESSION_CLOSED, nothing submitted', async () => {
    const s = submitSetup(undefined, 'SCORED');
    const result = await s.handler.execute(new SubmitSoundSessionCommand(ATTEMPT, USER, 'ru'));
    expect(result.error).toEqual({ code: 'SESSION_CLOSED' });
    expect(s.commandBus.execute).not.toHaveBeenCalled();
  });
});
