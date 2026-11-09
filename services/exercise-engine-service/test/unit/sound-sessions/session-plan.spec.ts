import {
  ladderOf,
  MAX_SOUNDS,
  planSession,
  soundsAfterDiagnostic,
  type SessionPlan,
} from '../../../src/modules/sound-sessions/domain/session-plan.js';
import { first, kj, length, material, noRecord, sj, tone, w, y } from './fixtures.js';

const ids = (plan: SessionPlan | string) =>
  typeof plan === 'string' ? plan : plan.sounds.map((s) => s.atomId);

describe('ladderOf (§5.2)', () => {
  it('a sound of running speech: word → second word → course line', () => {
    expect(ladderOf(kj, first)!.elements.map((e) => e.kind)).toEqual(['word', 'word', 'phrase']);
  });

  it('a phrase is judged on its carrier words', () => {
    const phrase = ladderOf(kj, first)!.elements[2]!;
    expect(phrase).toEqual({
      kind: 'phrase',
      text: 'Jeg kjenner ham.',
      carriers: ['kjenner'],
      source: 'uttale-06:p1',
    });
  });

  it('the two words are different words', () => {
    const [a, b] = ladderOf(kj, first)!.elements;
    expect(a!.kind === 'word' && b!.kind === 'word' && a.word.word !== b.word.word).toBe(true);
  });

  it('a rung without material is skipped, not invented', () => {
    expect(ladderOf(y, first)!.elements.map((e) => e.kind)).toEqual(['word']);
    expect(ladderOf(sj, first)!.elements.map((e) => e.kind)).toEqual(['word', 'word']);
  });

  it('length: word → pair, only the long vowel judged', () => {
    const ladder = ladderOf(length, first)!;
    expect(ladder.elements.map((e) => e.kind)).toEqual(['word', 'pair']);
    expect(ladder.elements[1]).toMatchObject({ kind: 'pair', judged: [0] });
  });

  it('toneme: word → pair, both tonemes judged', () => {
    expect(ladderOf(tone, first)!.elements[1]).toMatchObject({ kind: 'pair', judged: [0, 1] });
  });

  it('no word with a clip — nothing to start from', () => {
    expect(ladderOf({ ...kj, words: [] }, first)).toBeNull();
  });

  it('a toneme without a full pair is not drilled (Q31)', () => {
    expect(ladderOf({ ...tone, pairs: [] }, first)).toBeNull();
  });

  it('the word order follows the draw', () => {
    const last = () => 0.999;
    const a = ladderOf(kj, first)!.elements[0]!;
    const b = ladderOf(kj, last)!.elements[0]!;
    expect(a.kind === 'word' && b.kind === 'word' && a.word.word !== b.word.word).toBe(true);
  });
});

describe('planSession (Q31)', () => {
  it('the chosen sound alone', () => {
    const plan = planSession({ material: material(), learner: noRecord, chosen: 'nb:sj', rand: first });
    expect(plan).toMatchObject({ basis: 'chosen' });
    expect(ids(plan)).toEqual(['nb:sj']);
  });

  it('a chosen sound without material is refused', () => {
    expect(planSession({ material: material([kj]), learner: noRecord, chosen: 'nb:sj', rand: first })).toBe(
      'sound_not_drillable',
    );
  });

  it('nothing drillable at all', () => {
    expect(planSession({ material: material([{ ...kj, words: [] }]), learner: noRecord, rand: first })).toBe(
      'no_material',
    );
  });

  it.each([
    [
      'due cards first, in the order learning sent them',
      { cards: [{ atomId: 'nb:y', due: true }, { atomId: 'nb:kj', due: true }], flags: [] },
      ['nb:y', 'nb:kj'],
    ],
    [
      'then flags, more distinct days first',
      {
        cards: [{ atomId: 'nb:kj', due: true }],
        flags: [
          { atomId: 'nb:sj', days: 1, lastFlaggedOn: '2026-11-07', hasCard: false },
          { atomId: 'nb:y', days: 3, lastFlaggedOn: '2026-11-01', hasCard: false },
        ],
      },
      ['nb:kj', 'nb:y', 'nb:sj'],
    ],
    [
      'flags on as many days — the latest first',
      {
        cards: [],
        flags: [
          { atomId: 'nb:sj', days: 2, lastFlaggedOn: '2026-11-01', hasCard: false },
          { atomId: 'nb:y', days: 2, lastFlaggedOn: '2026-11-06', hasCard: false },
        ],
      },
      ['nb:y', 'nb:sj'],
    ],
    [
      'cards not yet due come after the flags',
      {
        cards: [{ atomId: 'nb:kj', due: false }],
        flags: [{ atomId: 'nb:sj', days: 1, lastFlaggedOn: '2026-11-07', hasCard: true }],
      },
      ['nb:sj', 'nb:kj'],
    ],
    [
      'a sound twice in the record is taken once',
      {
        cards: [{ atomId: 'nb:kj', due: true }],
        flags: [{ atomId: 'nb:kj', days: 2, lastFlaggedOn: '2026-11-07', hasCard: true }],
      },
      ['nb:kj'],
    ],
    [
      `at most ${MAX_SOUNDS} sounds`,
      {
        cards: ['nb:kj', 'nb:sj', 'nb:y', 'nb:tone'].map((atomId) => ({ atomId, due: true })),
        flags: [],
      },
      ['nb:kj', 'nb:sj', 'nb:y'],
    ],
    [
      'a sound of the record without material is passed over',
      { cards: [{ atomId: 'nb:r', due: true }, { atomId: 'nb:kj', due: true }], flags: [] },
      ['nb:kj'],
    ],
  ])('%s', (_name, learner, expected) => {
    const plan = planSession({ material: material(), learner, rand: first });
    expect(plan).toMatchObject({ basis: 'record', diagnostic: [], candidates: [] });
    expect(ids(plan)).toEqual(expected);
  });

  it('a record with no drillable sound is not a cold start: the catalogue order', () => {
    const plan = planSession({
      material: material(),
      learner: { cards: [{ atomId: 'nb:r', due: true }], flags: [] },
      rand: first,
    });
    expect(plan).toMatchObject({ basis: 'record' });
    expect(ids(plan)).toEqual(['nb:kj', 'nb:sj', 'nb:vowel_length']);
  });

  it('no record at all — the diagnostic, one word per drillable family', () => {
    const plan = planSession({ material: material(), learner: noRecord, rand: first }) as SessionPlan;
    expect(plan.basis).toBe('diagnostic');
    expect(plan.sounds).toEqual([]);
    expect(plan.diagnostic.map((d) => [d.atomId, d.family, d.word.word])).toEqual([
      ['nb:kj', 'kj', 'kjenne'],
      ['nb:sj', 'sj', 'skjorte'],
      ['nb:vowel_length', 'vowel_length', 'tak'],
      ['nb:tone', 'tone', 'jente'],
      ['nb:y', 'y', 'lys'],
    ]);
    expect(plan.candidates.map((c) => c.atomId)).toEqual(plan.diagnostic.map((d) => d.atomId));
  });

  it('a family that cannot be drilled has no diagnostic word', () => {
    const plan = planSession({
      material: material([kj, { ...tone, pairs: [] }]),
      learner: noRecord,
      rand: first,
    }) as SessionPlan;
    expect(plan.diagnostic.map((d) => d.atomId)).toEqual(['nb:kj']);
  });

  it('diagnostic words without a clip: the catalogue order instead', () => {
    const m = { ...material([kj, sj]), diagnostic: [] };
    const plan = planSession({ material: m, learner: noRecord, rand: first });
    expect(plan).toMatchObject({ basis: 'record' });
    expect(ids(plan)).toEqual(['nb:kj', 'nb:sj']);
  });
});

describe('soundsAfterDiagnostic', () => {
  const plan = planSession({ material: material(), learner: noRecord, rand: first }) as SessionPlan;

  it('the weak families, in catalogue order, at most three', () => {
    expect(
      soundsAfterDiagnostic(plan, ['nb:y', 'nb:tone', 'nb:kj', 'nb:sj']).map((s) => s.atomId),
    ).toEqual(['nb:kj', 'nb:sj', 'nb:tone']);
  });

  it('none weak — none to drill', () => {
    expect(soundsAfterDiagnostic(plan, [])).toEqual([]);
  });

  it('the ladder is the one drawn at the start', () => {
    expect(soundsAfterDiagnostic(plan, ['nb:kj'])[0]).toBe(plan.candidates[0]);
  });
});

it('fixture sanity: words carry their clip', () => {
  expect(w('kino')).toEqual({ word: 'kino', assetId: 'asset-kino', tone: null });
});
