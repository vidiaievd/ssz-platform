import { MatchPairsValidator } from '../../../../src/infrastructure/validation/validators/match-pairs.validator.js';

const validator = new MatchPairsValidator();

/**
 * Three pairs and one distractor. `rightId`s are deliberately not the pair ids and are
 * assigned out of order — the property that stops the student payload from being an
 * answer key (plan 49, decision 2).
 */
const content = {
  variant: 'halves',
  settings: { distractors: true, shuffle: true, showRemaining: true },
  pairs: [
    { id: 'p1', rightId: 'h3', left: 'Hvis det regner i morgen,', right: 'blir vi hjemme.' },
    { id: 'p2', rightId: 'h1', left: 'Jeg rakk ikke bussen fordi', right: 'jeg sto opp for sent.' },
    { id: 'p3', rightId: 'h4', left: 'Da vi var små,', right: 'bodde vi i Bergen.' },
  ],
  distractors: [{ id: 'h2', text: 'sto jeg opp for sent.' }],
};

const expectedAnswers = {
  feedback: {
    p1: { def: 'Etter en leddsetning først kommer verbet før subjektet.', why: 'Inversjon.', ov: {} },
    p2: {
      def: 'Etter «fordi» står subjektet først.',
      why: '',
      ov: {
        h2: { text: 'Riktige ord, feil rekkefølge: jeg sto, ikke sto jeg.', origin: 'author' },
      },
    },
    // No default written, deliberately: the resolved explanation must be null rather
    // than an empty string, so nothing can render a bare dash (AC-S9).
    p3: { def: '', why: '', ov: {} },
  },
};

const run = (
  placements: Array<{ pairId: string; rightId: string }>,
  checkSettings: Record<string, unknown> = { allow_partial_credit: true },
) =>
  validator.validate({
    submittedAnswer: { placements },
    expectedAnswers,
    content,
    checkSettings,
    targetLanguage: 'no',
  });

type Details = {
  totalPairs: number;
  correctPairs: number;
  pairs: Array<{ pairId: string; correct: boolean; explanation: string | null }>;
};

describe('MatchPairsValidator', () => {
  it('scores 100 when every pair is matched correctly', () => {
    const result = run([
      { pairId: 'p1', rightId: 'h3' },
      { pairId: 'p2', rightId: 'h1' },
      { pairId: 'p3', rightId: 'h4' },
    ]);

    expect(result.isOk).toBe(true);
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
  });

  it('scores 0 when every pair is wrong', () => {
    const result = run([
      { pairId: 'p1', rightId: 'h1' },
      { pairId: 'p2', rightId: 'h4' },
      { pairId: 'p3', rightId: 'h3' },
    ]);

    expect(result.value.correct).toBe(false);
    expect(result.value.score).toBe(0);
  });

  it('grades a partial submission against every pair, not against what was sent', () => {
    // One placement, and it is right. That is 1 of 3, not 1 of 1: partial checking is a
    // learning affordance, not a way to score full marks on a third of the exercise.
    const result = run([{ pairId: 'p1', rightId: 'h3' }]);

    const details = result.value.details as Details;
    expect(details.totalPairs).toBe(3);
    expect(details.correctPairs).toBe(1);
    expect(result.value.score).toBe(33);
    expect(result.value.correct).toBe(false);
  });

  it('reports nothing at all for slots the student left empty', () => {
    const details = run([{ pairId: 'p2', rightId: 'h1' }]).value.details as Details;

    expect(details.pairs).toHaveLength(1);
    expect(details.pairs[0]!.pairId).toBe('p2');
  });

  it('withholds partial credit when the check settings say so', () => {
    const result = run([{ pairId: 'p1', rightId: 'h3' }], { allow_partial_credit: false });
    expect(result.value.score).toBe(0);
  });

  it('resolves the override for exactly the half that was placed', () => {
    const details = run([{ pairId: 'p2', rightId: 'h2' }]).value.details as Details;

    expect(details.pairs[0]!.correct).toBe(false);
    expect(details.pairs[0]!.explanation).toBe(
      'Riktige ord, feil rekkefølge: jeg sto, ikke sto jeg.',
    );
  });

  it('falls back to the pair default when no override covers the placed half', () => {
    const details = run([{ pairId: 'p2', rightId: 'h4' }]).value.details as Details;

    expect(details.pairs[0]!.explanation).toBe('Etter «fordi» står subjektet først.');
  });

  it('returns null, not an empty string, when the teacher wrote no explanation', () => {
    const details = run([{ pairId: 'p3', rightId: 'h1' }]).value.details as Details;

    expect(details.pairs[0]!.correct).toBe(false);
    expect(details.pairs[0]!.explanation).toBeNull();
  });

  it('never explains a correct placement', () => {
    const details = run([{ pairId: 'p1', rightId: 'h3' }]).value.details as Details;

    expect(details.pairs[0]!.correct).toBe(true);
    expect(details.pairs[0]!.explanation).toBeNull();
  });

  it('never names the correct half in the verdict', () => {
    const details = run([{ pairId: 'p1', rightId: 'h1' }]).value.details as Details;

    expect(JSON.stringify(details)).not.toContain('blir vi hjemme.');
  });

  it('rejects a submission that is not a list of placements', () => {
    const result = validator.validate({
      submittedAnswer: { pairs: [{ left_id: 'a', right_id: '1' }] },
      expectedAnswers,
      content,
      checkSettings: {},
      targetLanguage: 'no',
    });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('refuses an exercise with no complete pairs rather than scoring it 100', () => {
    const result = validator.validate({
      submittedAnswer: { placements: [] },
      expectedAnswers: { feedback: {} },
      content: { variant: 'pairs', settings: {}, pairs: [], distractors: [] },
      checkSettings: {},
      targetLanguage: 'no',
    });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });

  it('reads a pre-plan-49 document by its answer key, not by column position', () => {
    // The pairing used to live in `expected_answers.pairs`, and five seeded exercises
    // were written with the right column deliberately out of order.
    const result = validator.validate({
      submittedAnswer: { placements: [{ pairId: 'l1', rightId: 'ql1' }] },
      content: {
        left_items: [
          { id: 'l1', text: 'fordi' },
          { id: 'l2', text: 'selv om' },
        ],
        right_items: [
          { id: 'r1', text: 'хотя' },
          { id: 'r2', text: 'потому что' },
        ],
      },
      expectedAnswers: {
        pairs: [
          { left_id: 'l1', right_id: 'r2' },
          { left_id: 'l2', right_id: 'r1' },
        ],
      },
      checkSettings: { allow_partial_credit: true },
      targetLanguage: 'no',
    });

    const details = result.value.details as Details;
    expect(details.pairs[0]!.correct).toBe(true);
  });
});
