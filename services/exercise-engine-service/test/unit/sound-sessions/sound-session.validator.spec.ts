import { SoundSessionValidator } from '../../../src/infrastructure/validation/validators/sound-session.validator.js';
import { planSession, type SessionPlan } from '../../../src/modules/sound-sessions/domain/session-plan.js';
import { nextState, startState, stopSession, type TakeVerdict } from '../../../src/modules/sound-sessions/domain/session-step.js';
import { readPlan, readState, toContent } from '../../../src/modules/sound-sessions/domain/sound-session-template.js';
import { first, material, noRecord } from './fixtures.js';

const PASS: TakeVerdict = { measured: true, passed: true, key: null, explained: false };
const MISS: TakeVerdict = { measured: true, passed: false, key: 'KJ:major', explained: true };

const record = planSession({
  material: material(),
  learner: { cards: [{ atomId: 'nb:y', due: true }, { atomId: 'nb:kj', due: true }], flags: [] },
  rand: first,
}) as SessionPlan;

const validate = (plan: SessionPlan, state: unknown) =>
  new SoundSessionValidator().validate({
    submittedAnswer: { state },
    expectedAnswers: null,
    content: toContent(plan),
    checkSettings: {},
    targetLanguage: 'nb',
  });

describe('SoundSessionValidator', () => {
  it('the share of the sounds that passed, and each sound rated', () => {
    // y: one word, passed. kj: three misses on its first word — closed as not passed.
    let state = startState(record);
    for (const v of [PASS, MISS, MISS, MISS]) state = nextState(record, state, v).state;

    const result = validate(record, state);
    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({ correct: false, score: 50, requiresReview: false });
    expect(result.value.details).toEqual({
      basis: 'record',
      doneReason: 'finished',
      takes: 4,
      sounds: [
        { atomId: 'nb:y', status: 'passed', passes: 1, fails: 0, rating: 'GOOD' },
        { atomId: 'nb:kj', status: 'failed', passes: 0, fails: 3, rating: 'AGAIN' },
      ],
      diagnosticWeak: [],
    });
  });

  it('a diagnostic that found nothing weak scores 100 and says so', () => {
    const plan = planSession({ material: material(), learner: noRecord, rand: first }) as SessionPlan;
    let state = startState(plan);
    for (let i = 0; i < plan.diagnostic.length; i++) state = nextState(plan, state, PASS).state;
    expect(validate(plan, state).value).toMatchObject({ correct: false, score: 100, details: { sounds: [], diagnosticWeak: [] } });
  });

  it('a session stopped early is scored on what it measured', () => {
    const state = stopSession(nextState(record, startState(record), PASS).state, 'stopped').state;
    expect(validate(record, state).value).toMatchObject({ score: 50, details: { doneReason: 'stopped' } });
  });

  it('no plan in the content', () => {
    const result = new SoundSessionValidator().validate({
      submittedAnswer: { state: startState(record) },
      expectedAnswers: null,
      content: { plan: 'nope' },
      checkSettings: {},
      targetLanguage: 'nb',
    });
    expect(result.error).toMatchObject({ code: 'SS_NO_PLAN' });
  });

  it('no state recorded', () => {
    expect(validate(record, null).error).toMatchObject({ code: 'SS_NO_STATE' });
  });
});

describe('sound-session-template readers', () => {
  it('a plan round-trips through the content', () => {
    expect(readPlan(toContent(record))).toEqual(record);
  });

  it.each([null, {}, { version: 2, plan: record }, { version: 1, plan: { ...record, basis: 'other' } }])(
    'not a plan: %p',
    (content) => {
      expect(readPlan(content)).toBeNull();
    },
  );

  it.each([null, {}, { phase: 'drill', diagnostic: [], sounds: [] }])('not a state: %p', (value) => {
    expect(readState(value)).toBeNull();
  });
});
