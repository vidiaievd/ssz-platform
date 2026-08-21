import { matchPairsViolations } from './match-pairs-preflight.js';

// Pre-flight is where plan 49's decision 5 lands: there is no `state: ready` on the
// exercise, so "may this be published?" is answered by running the builder's own
// validation engine over the stored document.

const settings = { distractors: true, shuffle: true, showRemaining: true };

/** A complete `halves` exercise: three pairs, one extra, every default written. */
function ready() {
  return {
    id: 'ex-1',
    content: {
      variant: 'halves',
      settings,
      pairs: [
        { id: 'p1', rightId: 'h1', left: 'Hvis det regner i morgen,', right: 'blir vi hjemme.' },
        {
          id: 'p2',
          rightId: 'h2',
          left: 'Jeg rakk ikke bussen fordi',
          right: 'jeg sto opp for sent.',
        },
        { id: 'p3', rightId: 'h3', left: 'Hun sa at', right: 'hun kom senere.' },
      ],
      distractors: [{ id: 'h9', text: 'vi blir hjemme.' }],
    },
    expectedAnswers: {
      feedback: {
        p1: { def: 'Se på ordstillingen.', why: '', ov: {} },
        p2: { def: 'Etter «fordi» står subjektet først.', why: '', ov: {} },
        p3: { def: 'Se på ordstillingen.', why: '', ov: {} },
      },
    },
  };
}

describe('matchPairsViolations', () => {
  it('reports nothing on a finished exercise', () => {
    expect(matchPairsViolations(ready())).toEqual([]);
  });

  it('blocks on fewer than three complete pairs, and says how many there are', () => {
    const exercise = ready();
    exercise.content.pairs = exercise.content.pairs.slice(0, 2);

    const violations = matchPairsViolations(exercise);

    expect(violations).toContainEqual({
      ruleCode: 'MATCHPAIRS_EX_TOO_FEW_PAIRS',
      severity: 'blocker',
      itemType: 'EXERCISE',
      itemId: 'ex-1',
      detail: 'The exercise has 2 complete pairs, and needs at least 3',
    });
  });

  it('blocks a missing default explanation for sentence halves', () => {
    const exercise = ready();
    exercise.expectedAnswers.feedback = {};

    const violations = matchPairsViolations(exercise);
    const noDefault = violations.find((v) => v.ruleCode === 'MATCHPAIRS_FB_NO_DEFAULT');

    expect(noDefault).toMatchObject({
      severity: 'blocker',
      detail: '3 pairs have no default explanation',
    });
  });

  it('only warns about it for word pairs, where the reason is on the screen (decision 3)', () => {
    const exercise = ready();
    exercise.content.variant = 'pairs';
    exercise.expectedAnswers.feedback = {};

    const violations = matchPairsViolations(exercise);

    expect(violations.find((v) => v.ruleCode === 'MATCHPAIRS_FB_NO_DEFAULT')?.severity).toBe(
      'warning',
    );
    expect(violations.filter((v) => v.severity === 'blocker')).toEqual([]);
  });

  it('counts one violation per code however many pairs are at fault', () => {
    const exercise = ready();
    exercise.content.pairs[0].right = '';
    exercise.content.pairs[1].right = '';

    const halfEmpty = matchPairsViolations(exercise).filter(
      (v) => v.ruleCode === 'MATCHPAIRS_PAIR_HALF_EMPTY',
    );

    expect(halfEmpty).toHaveLength(1);
    expect(halfEmpty[0].detail).toBe('2 pairs have only one half written');
  });

  it('blocks two right halves that read the same', () => {
    const exercise = ready();
    exercise.content.distractors = [{ id: 'h9', text: '  BLIR VI   hjemme. ' }];

    expect(matchPairsViolations(exercise)).toContainEqual(
      expect.objectContaining({
        ruleCode: 'MATCHPAIRS_POOL_DUPLICATE',
        severity: 'blocker',
      }),
    );
  });

  it('judges a document still in the pre-plan-49 shape, pairing it from the answers', () => {
    const legacy = {
      id: 'ex-legacy',
      content: {
        left_items: [
          { id: 'l1', text: 'fordi' },
          { id: 'l2', text: 'selv om' },
        ],
        right_items: [
          { id: 'r1', text: 'likevel' },
          { id: 'r2', text: 'derfor' },
        ],
      },
      expectedAnswers: {
        pairs: [
          { left_id: 'l1', right_id: 'r2' },
          { left_id: 'l2', right_id: 'r1' },
        ],
      },
    };

    const violations = matchPairsViolations(legacy);

    // Two pairs is below the minimum, and an absent `variant` reads as `pairs`, so the
    // missing explanations are only a warning.
    expect(violations.find((v) => v.ruleCode === 'MATCHPAIRS_EX_TOO_FEW_PAIRS')?.severity).toBe(
      'blocker',
    );
    expect(violations.find((v) => v.ruleCode === 'MATCHPAIRS_FB_NO_DEFAULT')?.severity).toBe(
      'warning',
    );
  });

  it('never reports the missing title — the platform has no such field', () => {
    expect(matchPairsViolations(ready()).map((v) => v.ruleCode)).not.toContain(
      'MATCHPAIRS_EX_NO_TITLE',
    );
  });
});
