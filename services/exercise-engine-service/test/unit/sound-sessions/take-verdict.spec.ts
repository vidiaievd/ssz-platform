import {
  readSoundTake,
  readTonemeTake,
} from '../../../src/modules/sound-sessions/application/take-verdict.js';
import type {
  SoundTakeOutcome,
  TonemeTakeOutcome,
} from '../../../src/modules/sound-sessions/application/ports/sound-session.ports.js';

const feedback = {} as never;
const weakest = {
  word: 'kino',
  symbols: ['KJ'],
  ipa: 'ç',
  accuracy: 20,
  threshold: 53,
  severity: 'major' as const,
  key: 'KJ:major',
};

const ok = (target: Extract<SoundTakeOutcome, { status: 'ok' }>['target']): SoundTakeOutcome => ({
  status: 'ok',
  feedback,
  target,
  aiCallIds: ['c1'],
});

describe('readSoundTake', () => {
  it('a missed target: its key, and whether the model explained it', () => {
    expect(
      readSoundTake(ok({ atomId: 'nb:kj', measured: true, passed: false, weakest, explained: true })),
    ).toEqual({ kind: 'verdict', verdict: { measured: true, passed: false, key: 'KJ:major', explained: true } });
  });

  it('a passed target has no key, whatever ai-service sent', () => {
    expect(
      readSoundTake(ok({ atomId: 'nb:kj', measured: true, passed: true, weakest, explained: false })),
    ).toEqual({ kind: 'verdict', verdict: { measured: true, passed: true, key: null, explained: false } });
  });

  it.each([
    ['not measured', ok({ atomId: 'nb:kj', measured: false, reason: 'word_not_heard', passed: false, weakest: null, explained: false })],
    ['no target in the answer', ok(null)],
    ['a silent take', { status: 'failed', errorCode: 'recording_inaudible', aiCallIds: [] } as SoundTakeOutcome],
    ['an unreadable take', { status: 'failed', errorCode: 'recording_unreadable', aiCallIds: [] } as SoundTakeOutcome],
  ])('%s → measures nothing', (_name, outcome) => {
    expect(readSoundTake(outcome)).toEqual({ kind: 'verdict', verdict: { measured: false } });
  });

  it.each(['pool_empty', 'not_available'] as const)('%s stops the session', (reason) => {
    expect(readSoundTake({ status: 'refused', reason, retryAfterMs: null })).toEqual({ kind: 'stop', reason });
  });

  it("ai-service's take limit of the session (step 14.1) stops it as the take limit", () => {
    expect(readSoundTake({ status: 'refused', reason: 'session_limit', retryAfterMs: null })).toEqual({ kind: 'stop', reason: 'take_limit' });
  });

  it.each([
    ['the provider away', { status: 'failed', errorCode: 'unavailable', aiCallIds: [] }],
    ['a recording still uploading', { status: 'failed', errorCode: 'recording_not_ready', aiCallIds: [] }],
    ['the daily limit of a sentence', { status: 'refused', reason: 'attempt_limit', retryAfterMs: 1000 }],
    ['a target the plan got wrong', { status: 'refused', reason: 'target_not_in_sentence', retryAfterMs: null }],
  ] as Array<[string, SoundTakeOutcome]>)('%s → the same step, no take', (_name, outcome) => {
    expect(readSoundTake(outcome)).toMatchObject({ kind: 'retry' });
  });
});

const tonemeOk = (verdict: Extract<TonemeTakeOutcome, { status: 'ok' }>['comparison']['verdict']): TonemeTakeOutcome => ({
  status: 'ok',
  word: 'fiske',
  sentence: 'Nå sier jeg fiske igjen.',
  accuracy: 80,
  comparison: { tone: 2, gap: 1, verdict },
  melody: { stepMs: 10, learner: [], reference: [] },
  aiCallIds: ['c1'],
});

describe('readTonemeTake (plan 88 Q4)', () => {
  it('like the reference passes', () => {
    expect(readTonemeTake(tonemeOk({ kind: 'like_reference' }))).toEqual({
      kind: 'verdict',
      verdict: { measured: true, passed: true, key: null, explained: false },
    });
  });

  it('the other toneme is a miss, keyed by what was heard', () => {
    expect(readTonemeTake(tonemeOk({ kind: 'other_tone', heardAs: 1 }))).toEqual({
      kind: 'verdict',
      verdict: { measured: true, passed: false, key: 'TONE:1', explained: false },
    });
  });

  it.each([
    ['unsure — not far enough to say «wrong»', tonemeOk({ kind: 'unsure' })],
    ['no voiced vowel', tonemeOk({ kind: 'not_measured' })],
    ['the word not heard', { status: 'unheard', reason: 'word_not_heard', accuracy: null, aiCallIds: [] } as TonemeTakeOutcome],
  ])('%s → measures nothing', (_name, outcome) => {
    expect(readTonemeTake(outcome)).toEqual({ kind: 'verdict', verdict: { measured: false } });
  });

  it('pool_empty stops the session', () => {
    expect(readTonemeTake({ status: 'refused', reason: 'pool_empty' })).toEqual({ kind: 'stop', reason: 'pool_empty' });
  });

  it('the take limit of the session stops it too', () => {
    expect(readTonemeTake({ status: 'refused', reason: 'session_limit' })).toEqual({ kind: 'stop', reason: 'take_limit' });
  });

  it('a reference that is not one — the same step, no take', () => {
    expect(readTonemeTake({ status: 'refused', reason: 'not_a_reference' })).toMatchObject({ kind: 'retry' });
  });
});
