import { describe, expect, it } from 'vitest';

import type { MatchPairs, Pair } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import { blockers, defaultExplanationLevel, isReady, issues, stepState } from './issues.js';

const pair = (n: number, left: string, right: string): Pair => ({
  id: `p${n}`,
  rightId: `q${n}`,
  left,
  right,
});

/** Six pairs, extras written, every default filled — nothing to report. */
function clean(overrides: Partial<MatchPairs> = {}): MatchPairs {
  const pairs = [
    pair(1, 'Hvis det regner i morgen,', 'blir vi hjemme.'),
    pair(2, 'Jeg rakk ikke bussen fordi', 'jeg sto opp for sent.'),
    pair(3, 'Da vi var barn,', 'bodde vi i Bergen.'),
    pair(4, 'Han spurte om', 'jeg ville bli med.'),
    pair(5, 'Selv om det var kaldt,', 'gikk vi tur.'),
    pair(6, 'Når hun kommer hjem,', 'lager hun middag.'),
  ];

  return {
    id: 'ex1',
    type: 'match_pairs',
    moduleId: 'm1',
    title: 'Setningshalvdeler',
    instructions: 'Sett sammen halvdelene.',
    variant: 'halves',
    settings: { ...DEFAULT_SETTINGS },
    pairs,
    distractors: [{ id: 'd1', text: 'vi bodde i Bergen.' }],
    feedback: Object.fromEntries(
      pairs.map((p) => [p.id, { def: 'Se på ordstillingen.', why: '', ov: {} }]),
    ),
    updatedAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

const codes = (ex: MatchPairs) => issues(ex).map((issue) => issue.code);

describe('issues', () => {
  it('reports nothing on a finished document', () => {
    expect(issues(clean())).toEqual([]);
    expect(isReady(clean())).toBe(true);
  });

  // ── Step 1 ────────────────────────────────────────────────────────────────

  it('blocks on an empty title', () => {
    expect(codes(clean({ title: '   ' }))).toContain('EX_NO_TITLE');
  });

  it('blocks a pair with exactly one half, and says nothing about an untouched row', () => {
    // AC-B2. A wholly empty pair is a row not yet written, not a mistake.
    const ex = clean();
    ex.pairs = [...ex.pairs, pair(7, 'Bare venstre', ''), pair(8, '', '')];

    const halfEmpty = issues(ex).filter((issue) => issue.code === 'PAIR_HALF_EMPTY');
    expect(halfEmpty).toEqual([
      { code: 'PAIR_HALF_EMPTY', level: 'blocker', step: 1, pairId: 'p7', pairIndex: 6 },
    ]);
  });

  it('blocks fewer than three complete pairs', () => {
    // AC-B9.
    const ex = clean({ pairs: [pair(1, 'a', 'x'), pair(2, 'b', 'y')] });
    expect(issues(ex)).toContainEqual({
      code: 'EX_TOO_FEW_PAIRS',
      level: 'blocker',
      step: 1,
      pairCount: 2,
      required: 3,
    });
  });

  it('warns on a repeated left half, on the second occurrence only', () => {
    const ex = clean();
    ex.pairs = [...ex.pairs, pair(7, ' hvis det regner i MORGEN, ', 'noe annet.')];

    const duplicates = issues(ex).filter((issue) => issue.code === 'PAIR_LEFT_DUPLICATE');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ pairId: 'p7', level: 'warning' });
  });

  it('warns on a right half over twelve words', () => {
    const long = 'en to tre fire fem seks sju åtte ni ti elleve tolv tretten';
    const ex = clean();
    ex.pairs = [...ex.pairs.slice(1), pair(1, 'Venstre', long)];

    expect(issues(ex)).toContainEqual({
      code: 'PAIR_RIGHT_LONG',
      level: 'warning',
      step: 1,
      pairId: 'p1',
      pairIndex: 5,
      wordCount: 13,
    });
  });

  // ── Step 2 ────────────────────────────────────────────────────────────────

  it('blocks two pool halves that normalise to the same text', () => {
    // AC-X8 / AC-B11: the student cannot tell them apart, so grading is a coin toss.
    const ex = clean({ distractors: [{ id: 'd1', text: '  Blir VI   hjemme. ' }] });
    expect(issues(ex)).toContainEqual({
      code: 'POOL_DUPLICATE',
      level: 'blocker',
      step: 2,
      text: 'Blir VI   hjemme.',
    });
  });

  it('finds a duplicate between two answers, not only against a distractor', () => {
    const ex = clean();
    ex.pairs[1] = { ...ex.pairs[1]!, right: 'blir vi hjemme.' };
    expect(codes(ex)).toContain('POOL_DUPLICATE');
  });

  it('says nothing about a duplicate hiding in a switched-off distractor', () => {
    // Reporting an error the teacher cannot see on screen is worse than not reporting it.
    const ex = clean({
      settings: { ...DEFAULT_SETTINGS, distractors: false },
      distractors: [{ id: 'd1', text: 'blir vi hjemme.' }],
    });
    expect(codes(ex)).not.toContain('POOL_DUPLICATE');
  });

  it('warns when the extras are on but none are written', () => {
    // AC-B13: the pool then equals the answers and the last match solves itself.
    const ex = clean({ distractors: [] });
    expect(issues(ex)).toContainEqual({ code: 'POOL_NO_DISTRACTORS', level: 'warning', step: 2 });
  });

  it('warns when the extras are off and the set is short', () => {
    const ex = clean({
      settings: { ...DEFAULT_SETTINGS, distractors: false },
      pairs: clean().pairs.slice(0, 5),
    });
    expect(issues(ex)).toContainEqual({
      code: 'POOL_TOO_SMALL',
      level: 'warning',
      step: 2,
      pairCount: 5,
    });
  });

  it('stops warning about the short pool once there are six pairs', () => {
    const ex = clean({ settings: { ...DEFAULT_SETTINGS, distractors: false } });
    expect(codes(ex)).not.toContain('POOL_TOO_SMALL');
  });

  it('says nothing about the pool of an exercise with no pairs yet', () => {
    const ex = clean({ pairs: [], distractors: [] });
    expect(codes(ex)).not.toContain('POOL_NO_DISTRACTORS');
    expect(codes(ex)).not.toContain('POOL_TOO_SMALL');
  });

  // ── Step 3 ────────────────────────────────────────────────────────────────

  it('blocks a missing default explanation for `halves`', () => {
    const ex = clean({ feedback: {} });
    const missing = issues(ex).filter((issue) => issue.code === 'FB_NO_DEFAULT');
    expect(missing).toHaveLength(6);
    expect(missing.every((issue) => issue.level === 'blocker')).toBe(true);
    expect(isReady(ex)).toBe(false);
  });

  it('only warns about it for `pairs`, so existing courses still publish', () => {
    // Plan 49, decision 3. A blocker here reaches publish-version.handler and stops the
    // whole container version — over prose that would restate what is on the screen.
    const ex = clean({ variant: 'pairs', feedback: {} });
    const missing = issues(ex).filter((issue) => issue.code === 'FB_NO_DEFAULT');
    expect(missing).toHaveLength(6);
    expect(missing.every((issue) => issue.level === 'warning')).toBe(true);
    expect(isReady(ex)).toBe(true);
  });

  it('exposes the level rule on its own, for the builder to explain itself', () => {
    expect(defaultExplanationLevel('halves')).toBe('blocker');
    expect(defaultExplanationLevel('pairs')).toBe('warning');
  });

  it('does not ask for an explanation for a pair that is not complete', () => {
    const ex = clean({ feedback: {} });
    ex.pairs = [...ex.pairs, pair(7, 'Bare venstre', '')];
    expect(issues(ex).filter((issue) => issue.code === 'FB_NO_DEFAULT')).toHaveLength(6);
  });

  // ── Ordering and the surfaces that read it ────────────────────────────────

  it('lists problems in authoring order — step 1, then 2, then 3', () => {
    const ex = clean({
      title: '',
      variant: 'halves',
      distractors: [{ id: 'd1', text: 'blir vi hjemme.' }],
      feedback: {},
    });
    const steps = issues(ex).map((issue) => issue.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('blockers() is issues() filtered, not a second engine', () => {
    const ex = clean({ title: '', feedback: {} });
    expect(blockers(ex)).toEqual(issues(ex).filter((issue) => issue.level === 'blocker'));
  });
});

describe('stepState', () => {
  it('counts blockers, then warnings, on the step that owns them', () => {
    const ex = clean({ title: '', distractors: [] });
    expect(stepState(ex, 1)).toEqual({ state: 'blocker', count: 1 });
    expect(stepState(ex, 2)).toEqual({ state: 'warning', count: 1 });
    expect(stepState(ex, 3)).toEqual({ state: 'ok', count: 0 });
  });

  it('reports a step nobody has written yet as empty, not as passing', () => {
    const blank: MatchPairs = { ...clean(), pairs: [], distractors: [], feedback: {} };
    // Step 2 has nothing in it and nothing to say about it.
    expect(stepState(blank, 2)).toEqual({ state: 'empty', count: 0 });
    // Step 1 is *not* empty in the same sense: an exercise with no pairs is a blocker
    // (EX_TOO_FEW_PAIRS), and BEHAVIOR ranks the dot blocker → warning → ok → dashed.
    expect(stepState(blank, 1)).toEqual({ state: 'blocker', count: 1 });
  });

  it('reports step 3 as empty only while no explanation exists at all', () => {
    const ex = clean({ variant: 'pairs', feedback: {} });
    expect(stepState(ex, 3).state).toBe('warning');

    const none = clean({ variant: 'pairs', pairs: [], distractors: [], feedback: {} });
    expect(stepState(none, 3).state).toBe('empty');
  });
});
