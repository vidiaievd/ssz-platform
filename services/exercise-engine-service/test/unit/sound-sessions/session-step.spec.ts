import {
  planSession,
  type SessionPlan,
} from '../../../src/modules/sound-sessions/domain/session-plan.js';
import {
  currentStep,
  diagnosticWeak,
  MAX_DIAGNOSTIC_TAKES,
  MAX_FAILS_PER_ELEMENT,
  MAX_TAKES,
  nextState,
  soundOutcomes,
  startState,
  stopSession,
  type SessionState,
  type StepEvent,
  type TakeVerdict,
} from '../../../src/modules/sound-sessions/domain/session-step.js';
import { kj, length, material, noRecord, sj, tone, y } from './fixtures.js';

/** A draw that leaves the data's order: Fisher–Yates swaps nothing, a pick takes the last. */
const keep = (): number => 0.999;

const PASS: TakeVerdict = { measured: true, passed: true, key: null, explained: false };
const miss = (key = 'KJ:major', explained = true): TakeVerdict => ({
  measured: true,
  passed: false,
  key,
  explained,
});
const UNMEASURED: TakeVerdict = { measured: false };

const P = 'pass' as const;
const M = 'miss' as const;
const U = 'unmeasured' as const;
type Take = typeof P | typeof M | typeof U;
const verdictOf = (t: Take): TakeVerdict => (t === P ? PASS : t === M ? miss() : UNMEASURED);

function chosen(atomId: string, atoms = [kj, sj, length, tone, y]): SessionPlan {
  return planSession({ material: material(atoms), learner: noRecord, chosen: atomId, rand: keep }) as SessionPlan;
}

function record(atomIds: string[]): SessionPlan {
  return planSession({
    material: material(),
    learner: { cards: atomIds.map((atomId) => ({ atomId, due: true })), flags: [] },
    rand: keep,
  }) as SessionPlan;
}

function run(plan: SessionPlan, takes: Take[]): { state: SessionState; events: StepEvent[] } {
  let state = startState(plan);
  const events: StepEvent[] = [];
  for (const t of takes) {
    const step = nextState(plan, state, verdictOf(t));
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
}

describe('currentStep', () => {
  it('a word in its carrier frame, judged on itself', () => {
    const plan = chosen('nb:kj');
    expect(currentStep(plan, startState(plan))).toMatchObject({
      phase: 'drill',
      atomId: 'nb:kj',
      elementIndex: 0,
      element: { kind: 'word' },
      say: { word: 'kjenne', assetId: 'asset-kjenne' },
      judge: 'sounds',
      context: 'word',
      targetWords: ['kjenne'],
      fails: 0,
      takes: 0,
    });
  });

  it('a course line in running speech, judged on its carriers, nothing to imitate', () => {
    const plan = chosen('nb:kj');
    const { state } = run(plan, [P, P]);
    expect(currentStep(plan, state)).toMatchObject({
      element: { kind: 'phrase' },
      say: null,
      context: 'fluent',
      targetWords: ['kjenner'],
    });
  });

  it('a toneme is judged by its melody', () => {
    const plan = chosen('nb:tone');
    expect(currentStep(plan, startState(plan))).toMatchObject({ judge: 'toneme', say: { word: 'jente' } });
  });

  it('a toneme pair is said one word at a time, both judged', () => {
    const plan = chosen('nb:tone');
    const { state } = run(plan, [P]);
    expect(currentStep(plan, state)).toMatchObject({ element: { kind: 'pair' }, say: { word: 'fisken' } });
    expect(currentStep(plan, run(plan, [P, P]).state)).toMatchObject({ say: { word: 'fiske' } });
  });

  it('a length pair: the long word is said and judged, the short one is its contrast', () => {
    const plan = chosen('nb:vowel_length');
    const { state } = run(plan, [P]);
    expect(currentStep(plan, state)).toMatchObject({
      element: { kind: 'pair', judged: [0] },
      say: { word: 'tak' },
      targetWords: ['tak'],
    });
  });

  it('nothing once the session is done', () => {
    const plan = chosen('nb:y');
    expect(currentStep(plan, run(plan, [P]).state)).toBeNull();
  });
});

describe('nextState — the drill (§5.2)', () => {
  it.each<[string, string, Take[], Partial<SessionState>, string[]]>([
    ['three rungs passed — the sound passes', 'nb:kj', [P, P, P], { phase: 'done', doneReason: 'finished' }, ['passed']],
    ['a miss, then the same element passes', 'nb:kj', [M, P, P, P], { phase: 'done' }, ['passed']],
    [
      `${MAX_FAILS_PER_ELEMENT} misses on an element close the sound — no fourth try`,
      'nb:kj',
      [M, M, M],
      { phase: 'done', doneReason: 'finished' },
      ['failed'],
    ],
    ['unmeasured takes are not misses', 'nb:kj', [U, U, U, U, P, P, P], { phase: 'done' }, ['passed']],
    ['a toneme pair needs both words', 'nb:tone', [P, P], { phase: 'drill' }, ['open']],
    ['…and passes on the second', 'nb:tone', [P, P, P], { phase: 'done' }, ['passed']],
    ['a length pair is one take', 'nb:vowel_length', [P, P], { phase: 'done' }, ['passed']],
  ])('%s', (_name, atomId, takes, expected, statuses) => {
    const plan = chosen(atomId);
    const { state } = run(plan, takes);
    expect(state).toMatchObject(expected);
    expect(state.sounds.map((s) => s.status)).toEqual(statuses);
  });

  it('a miss on the second word of a pair stays on it', () => {
    const plan = chosen('nb:tone');
    const { state } = run(plan, [P, P, M]);
    expect(currentStep(plan, state)).toMatchObject({ say: { word: 'fiske' }, fails: 1 });
  });

  it('a closed sound hands over to the next one, from its first word', () => {
    const plan = record(['nb:kj', 'nb:sj']);
    const { state, events } = run(plan, [M, M, M]);
    expect(events.map((e) => e.kind)).toEqual(['retry', 'retry', 'sound_failed']);
    expect(currentStep(plan, state)).toMatchObject({ atomId: 'nb:sj', elementIndex: 0, fails: 0, takes: 0 });
  });

  it(`stops at ${MAX_TAKES} takes, measured or not`, () => {
    const plan = record(['nb:kj', 'nb:sj', 'nb:y']);
    const { state, events } = run(plan, Array<Take>(MAX_TAKES).fill(U));
    expect(state).toMatchObject({ phase: 'done', doneReason: 'take_limit', takes: MAX_TAKES });
    expect(events.at(-1)).toEqual({ kind: 'session_done', reason: 'take_limit' });
  });

  it('a done session does not move', () => {
    const plan = chosen('nb:y');
    const done = run(plan, [P]).state;
    expect(nextState(plan, done, PASS)).toEqual({ state: done, events: [] });
  });

  it('the stored state is not mutated', () => {
    const plan = chosen('nb:kj');
    const before = startState(plan);
    const copy = structuredClone(before);
    nextState(plan, before, miss());
    expect(before).toEqual(copy);
  });

  it('events of a full sound', () => {
    const plan = chosen('nb:tone');
    expect(run(plan, [P, P, P]).events.map((e) => e.kind)).toEqual([
      'element_passed',
      'side_passed',
      'element_passed',
      'sound_passed',
      'session_done',
    ]);
  });
});

describe('explained misses (§5.5a)', () => {
  it('each kind of miss once, in the order explained', () => {
    const plan = chosen('nb:kj');
    let state = startState(plan);
    state = nextState(plan, state, miss('KJ:major')).state;
    state = nextState(plan, state, miss('KJ:major', false)).state;
    expect(currentStep(plan, state)).toMatchObject({ explained: ['KJ:major'] });
    state = nextState(plan, state, miss('KJ:minor')).state;
    // The third miss closes the sound; the element keeps what was explained on it.
    expect(state.sounds[0]!.elements[0]!.explained).toEqual(['KJ:major', 'KJ:minor']);
  });

  it('a miss whose explanation did not come is not remembered — the next take asks again', () => {
    const plan = chosen('nb:kj');
    const state = nextState(plan, startState(plan), miss('KJ:major', false)).state;
    expect(currentStep(plan, state)).toMatchObject({ explained: [] });
  });

  it('a new element starts with none', () => {
    const plan = chosen('nb:kj');
    let state = startState(plan);
    state = nextState(plan, state, miss()).state;
    state = nextState(plan, state, PASS).state;
    expect(currentStep(plan, state)).toMatchObject({ elementIndex: 1, explained: [] });
  });
});

describe('the diagnostic (Q31, §5.5a)', () => {
  const plan = planSession({ material: material(), learner: noRecord, rand: keep }) as SessionPlan;
  const families = plan.diagnostic.length;

  it('one word per family, in order', () => {
    const state = startState(plan);
    expect(state.phase).toBe('diagnostic');
    expect(currentStep(plan, state)).toMatchObject({ phase: 'diagnostic', index: 0, total: families, word: { word: 'kjenne' } });
  });

  it('weak families become the drill; the diagnostic takes are not the drill takes', () => {
    // kj weak, sj strong, length unknown (never measured), tone weak, y strong.
    const { state, events } = run(plan, [M, P, ...Array<Take>(MAX_DIAGNOSTIC_TAKES).fill(U), M, P]);
    expect(diagnosticWeak(state)).toEqual(['nb:kj', 'nb:tone']);
    expect(state.diagnostic.map((d) => d.status)).toEqual(['weak', 'strong', 'unknown', 'weak', 'strong']);
    expect(events.find((e) => e.kind === 'diagnostic_done')).toEqual({
      kind: 'diagnostic_done',
      weak: ['nb:kj', 'nb:tone'],
    });
    expect(state).toMatchObject({ phase: 'drill', takes: 0 });
    expect(state.sounds.map((s) => [s.atomId, s.status])).toEqual([
      ['nb:kj', 'open'],
      ['nb:tone', 'pending'],
    ]);
    expect(currentStep(plan, state)).toMatchObject({ phase: 'drill', atomId: 'nb:kj', elementIndex: 0 });
  });

  it('nothing weak — the session is over', () => {
    const { state } = run(plan, Array<Take>(families).fill(P));
    expect(state).toMatchObject({ phase: 'done', doneReason: 'finished', sounds: [] });
  });

  it('a diagnostic word not measured is tried again before its family is left unknown', () => {
    const { state } = run(plan, [U]);
    expect(currentStep(plan, state)).toMatchObject({ phase: 'diagnostic', index: 0, takes: 1 });
  });

  it('diagnosed sounds are never rated by the diagnostic itself', () => {
    const { state } = run(plan, [M, P, P, P, P]);
    expect(soundOutcomes(state)).toEqual([
      { atomId: 'nb:kj', status: 'open', passes: 0, fails: 0, rating: null },
    ]);
  });
});

describe('stopSession', () => {
  it.each(['stopped', 'pool_empty'] as const)('%s: what was measured stands', (reason) => {
    const plan = chosen('nb:kj');
    const { state } = run(plan, [P]);
    const stopped = stopSession(state, reason);
    expect(stopped.state).toMatchObject({ phase: 'done', doneReason: reason });
    expect(stopped.events).toEqual([{ kind: 'session_done', reason }]);
    expect(soundOutcomes(stopped.state)[0]).toMatchObject({ passes: 1, rating: 'GOOD' });
  });

  it('a done session stays as it was', () => {
    const plan = chosen('nb:y');
    const done = run(plan, [P]).state;
    expect(stopSession(done, 'stopped')).toEqual({ state: done, events: [] });
  });
});

describe('soundOutcomes — one rating per sound (Q28)', () => {
  it.each<[string, Take[], 'GOOD' | 'HARD' | 'AGAIN' | null]>([
    ['passed with no miss', [P, P, P], 'GOOD'],
    ['passed after a miss', [P, M, P, P], 'HARD'],
    ['passed after two misses on one element', [M, M, P, P, P], 'HARD'],
    ['closed as not passed', [P, M, M, M], 'AGAIN'],
    ['unmeasured takes say nothing', [U, U, P, P, P], 'GOOD'],
  ])('%s → %s', (_name, takes, rating) => {
    const { state } = run(chosen('nb:kj'), takes);
    expect(soundOutcomes(state)[0]!.rating).toBe(rating);
  });

  it.each<[string, Take[], 'GOOD' | 'HARD' | 'AGAIN' | null]>([
    ['unfinished, a pass and no miss', [P], 'GOOD'],
    ['unfinished, a pass and a miss', [P, M], 'HARD'],
    ['unfinished, two misses and no pass', [M, M], 'AGAIN'],
    ['unfinished, one miss only — one noisy take does not reset a card', [M], null],
    ['unfinished, nothing measured', [U, U], null],
  ])('%s → %s', (_name, takes, rating) => {
    const { state } = run(chosen('nb:kj'), takes);
    const stopped = stopSession(state, 'stopped').state;
    expect(soundOutcomes(stopped)[0]!.rating).toBe(rating);
  });

  it('a sound the session never reached rates nothing', () => {
    const plan = record(['nb:kj', 'nb:sj']);
    const { state } = run(plan, [P]);
    expect(soundOutcomes(stopSession(state, 'stopped').state).map((o) => [o.atomId, o.rating])).toEqual([
      ['nb:kj', 'GOOD'],
      ['nb:sj', null],
    ]);
  });
});
