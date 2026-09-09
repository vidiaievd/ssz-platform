import { describe, expect, it } from 'vitest';

import type { MatchPairs, Pair } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import {
  completePairs,
  coverage,
  explanationFor,
  grade,
  isSolved,
  norm,
  pruneFeedback,
  rightItems,
  shuffled,
  wrongItems,
} from './selectors.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const pair = (n: number, left: string, right: string): Pair => ({
  id: `p${n}`,
  rightId: `q${n}`,
  left,
  right,
});

function doc(overrides: Partial<MatchPairs> = {}): MatchPairs {
  return {
    id: 'ex1',
    type: 'match_pairs',
    moduleId: 'm1',
    title: 'Setningshalvdeler',
    instructions: 'Sett sammen halvdelene.',
    variant: 'halves',
    settings: { ...DEFAULT_SETTINGS },
    pairs: [
      pair(1, 'Hvis det regner i morgen,', 'blir vi hjemme.'),
      pair(2, 'Jeg rakk ikke bussen fordi', 'jeg sto opp for sent.'),
      pair(3, 'Da vi var barn,', 'bodde vi i Bergen.'),
    ],
    distractors: [
      { id: 'd1', text: 'vi bodde i Bergen.' },
      { id: 'd2', text: 'sto jeg opp for sent.' },
    ],
    feedback: {
      p1: { def: 'Etter en leddsetning kommer verbet først.', why: 'Inversjon.', ov: {} },
      p2: { def: 'Etter «fordi» står subjektet først.', why: '', ov: {} },
      p3: { def: 'Se på tidsuttrykket.', why: '', ov: {} },
    },
    updatedAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

const authored = (text: string) => ({ text, origin: 'author' as const });

// ── The pool ────────────────────────────────────────────────────────────────

describe('rightItems', () => {
  it('is every complete pair right half, numbered, then the distractors', () => {
    expect(rightItems(doc())).toEqual([
      { id: 'q1', text: 'blir vi hjemme.', kind: 'answer', n: 1 },
      { id: 'q2', text: 'jeg sto opp for sent.', kind: 'answer', n: 2 },
      { id: 'q3', text: 'bodde vi i Bergen.', kind: 'answer', n: 3 },
      { id: 'd1', text: 'vi bodde i Bergen.', kind: 'distractor' },
      { id: 'd2', text: 'sto jeg opp for sent.', kind: 'distractor' },
    ]);
  });

  it('drops the extras when the setting is off, and restores them when it is back on', () => {
    const off = doc({ settings: { ...DEFAULT_SETTINGS, distractors: false } });
    expect(rightItems(off).map((item) => item.id)).toEqual(['q1', 'q2', 'q3']);
    // AC-B14: the toggle is a display rule, so the data behind it is untouched.
    expect(off.distractors).toHaveLength(2);
    expect(rightItems(doc()).map((item) => item.id)).toContain('d1');
  });

  it('ignores a pair with only one half, and one not yet written at all', () => {
    const ex = doc({
      pairs: [...doc().pairs, pair(4, 'Halv setning', ''), pair(5, '', '')],
    });
    expect(completePairs(ex)).toHaveLength(3);
    expect(rightItems(ex).filter((item) => item.kind === 'answer')).toHaveLength(3);
  });

  it('does not put a half-written distractor in the pool as an empty chip', () => {
    const ex = doc({ distractors: [{ id: 'd1', text: '  ' }] });
    expect(rightItems(ex).some((item) => item.kind === 'distractor')).toBe(false);
  });

  it('renumbers answers when the pairs are reordered, keeping ids', () => {
    const reordered = doc({ pairs: [doc().pairs[2]!, doc().pairs[0]!, doc().pairs[1]!] });
    expect(rightItems(reordered).slice(0, 3)).toEqual([
      { id: 'q3', text: 'bodde vi i Bergen.', kind: 'answer', n: 1 },
      { id: 'q1', text: 'blir vi hjemme.', kind: 'answer', n: 2 },
      { id: 'q2', text: 'jeg sto opp for sent.', kind: 'answer', n: 3 },
    ]);
  });
});

describe('wrongItems', () => {
  it('is the pool without the pair own half — the editable matrix columns', () => {
    expect(wrongItems(doc(), 'p2').map((item) => item.id)).toEqual(['q1', 'q3', 'd1', 'd2']);
  });
});

// ── Coverage ────────────────────────────────────────────────────────────────

describe('coverage', () => {
  it('counts one cell per (complete pair x other pool item)', () => {
    // 3 pairs x (5 pool items - its own) = 12
    expect(coverage(doc())).toMatchObject({ total: 12, written: 0, noDefault: 0, pairs: 3 });
  });

  it('counts authored overrides only, never AI drafts', () => {
    const ex = doc();
    ex.feedback['p1']!.ov = {
      q2: authored('Feil tid.'),
      d1: { text: 'Utkast', origin: 'ai_draft' },
    };
    expect(coverage(ex)).toMatchObject({ written: 1, total: 12 });
  });

  it('shrinks the total when the extras are switched off', () => {
    const off = doc({ settings: { ...DEFAULT_SETTINGS, distractors: false } });
    // 3 pairs x 2 other answers
    expect(coverage(off).total).toBe(6);
  });

  it('reports pairs with no default explanation', () => {
    const ex = doc({ feedback: { p1: { def: '   ', why: '', ov: {} } } });
    expect(coverage(ex).noDefault).toBe(3);
  });

  it('is 0% rather than NaN when there is nothing to cover', () => {
    expect(coverage(doc({ pairs: [], distractors: [] })).pct).toBe(0);
  });
});

// ── Explanation resolution ──────────────────────────────────────────────────

describe('explanationFor', () => {
  it('prefers the cell override over the pair default', () => {
    const ex = doc();
    ex.feedback['p2']!.ov = { d2: authored('Ordene stemmer, rekkefølgen ikke.') };
    expect(explanationFor(ex, 'p2', 'd2')).toBe('Ordene stemmer, rekkefølgen ikke.');
    expect(explanationFor(ex, 'p2', 'd1')).toBe('Etter «fordi» står subjektet først.');
  });

  it('falls back past an unaccepted AI draft to the default', () => {
    const ex = doc();
    ex.feedback['p2']!.ov = { d2: { text: 'Utkast', origin: 'ai_draft' } };
    expect(explanationFor(ex, 'p2', 'd2')).toBe('Etter «fordi» står subjektet først.');
  });

  it('is null, never an empty string, when the teacher wrote nothing', () => {
    const ex = doc({ feedback: {} });
    // AC-S9: the runner must be unable to render an empty block or a bare dash.
    expect(explanationFor(ex, 'p1', 'd1')).toBeNull();
  });
});

// ── Grading ─────────────────────────────────────────────────────────────────

describe('grade', () => {
  it('marks a half attached to its own pair correct, with nothing to explain', () => {
    expect(grade(doc(), [{ pairId: 'p1', rightId: 'q1' }])).toEqual([
      { pairId: 'p1', correct: true, explanation: null },
    ]);
  });

  it('grades only what was sent — unplaced pairs are unanswered, not wrong', () => {
    // AC-S7: partial checking is deliberate for this type.
    const results = grade(doc(), [{ pairId: 'p2', rightId: 'd2' }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ pairId: 'p2', correct: false });
  });

  it('resolves the explanation for exactly the half that was attached', () => {
    const ex = doc();
    ex.feedback['p2']!.ov = { d2: authored('Ordene stemmer, rekkefølgen ikke.') };
    expect(grade(ex, [{ pairId: 'p2', rightId: 'd2' }])[0]!.explanation).toBe(
      'Ordene stemmer, rekkefølgen ikke.',
    );
    expect(grade(ex, [{ pairId: 'p2', rightId: 'q3' }])[0]!.explanation).toBe(
      'Etter «fordi» står subjektet først.',
    );
  });

  it('ignores a placement against a pair that is not complete', () => {
    const ex = doc({ pairs: [...doc().pairs, pair(4, 'Halv', '')] });
    expect(grade(ex, [{ pairId: 'p4', rightId: 'd1' }])).toEqual([]);
  });

  it('returns results in document order, whatever order the placements arrive in', () => {
    const results = grade(doc(), [
      { pairId: 'p3', rightId: 'q3' },
      { pairId: 'p1', rightId: 'q1' },
    ]);
    expect(results.map((result) => result.pairId)).toEqual(['p1', 'p3']);
  });

  it('never normalises: two halves reading the same are told apart by id', () => {
    const ex = doc({
      pairs: [pair(1, 'A', 'samme'), pair(2, 'B', ' Samme '), pair(3, 'C', 'ulik')],
    });
    expect(grade(ex, [{ pairId: 'p1', rightId: 'q2' }])[0]!.correct).toBe(false);
  });
});

describe('isSolved', () => {
  it('is true only when every complete pair is placed and correct', () => {
    const all = [
      { pairId: 'p1', rightId: 'q1' },
      { pairId: 'p2', rightId: 'q2' },
      { pairId: 'p3', rightId: 'q3' },
    ];
    expect(isSolved(doc(), all)).toBe(true);
    expect(isSolved(doc(), all.slice(0, 2))).toBe(false);
    expect(isSolved(doc(), [...all.slice(0, 2), { pairId: 'p3', rightId: 'd1' }])).toBe(false);
  });

  it('is false for an exercise with nothing to solve', () => {
    expect(isSolved(doc({ pairs: [] }), [])).toBe(false);
  });
});

// ── The cascades ────────────────────────────────────────────────────────────

describe('pruneFeedback', () => {
  it('drops the feedback row of a deleted pair', () => {
    const ex = doc();
    ex.pairs = ex.pairs.filter((p) => p.id !== 'p3');
    expect(Object.keys(pruneFeedback(ex).feedback)).toEqual(['p1', 'p2']);
  });

  it('drops other pairs overrides that pointed at the deleted pair half', () => {
    // AC-B4: deleting a pair takes its half out of the pool, so every explanation of
    // "why that half is wrong here" is about something the student can no longer choose.
    const ex = doc();
    ex.feedback['p1']!.ov = { q3: authored('Feil tid.'), d1: authored('Feil rekkefølge.') };
    ex.pairs = ex.pairs.filter((p) => p.id !== 'p3');

    const pruned = pruneFeedback(ex);
    expect(Object.keys(pruned.feedback['p1']!.ov)).toEqual(['d1']);
    expect(coverage(pruned).written).toBe(1);
  });

  it('drops every override on a deleted distractor', () => {
    // AC-B12: removing an extra half removes its matrix column and all its texts.
    const ex = doc();
    ex.feedback['p1']!.ov = { d1: authored('a') };
    ex.feedback['p2']!.ov = { d1: authored('b'), d2: authored('c') };
    ex.distractors = ex.distractors.filter((d) => d.id !== 'd1');

    const pruned = pruneFeedback(ex);
    expect(pruned.feedback['p1']!.ov).toEqual({});
    expect(Object.keys(pruned.feedback['p2']!.ov)).toEqual(['d2']);
  });

  it('keeps overrides on a distractor that is only switched off', () => {
    // The trap this type invites: `settings.distractors` is a display rule. Treating it
    // as a delete would lose the teacher writing the moment they flipped a toggle to see
    // what the pool looked like — and AC-B14 requires switching back to restore both.
    const ex = doc({ settings: { ...DEFAULT_SETTINGS, distractors: false } });
    ex.feedback['p1']!.ov = { d1: authored('Feil rekkefølge.') };

    expect(pruneFeedback(ex).feedback['p1']!.ov).toEqual({ d1: authored('Feil rekkefølge.') });
    // Not counted while the column is hidden, counted again when it is back.
    expect(coverage(pruneFeedback(ex)).written).toBe(0);
    expect(coverage({ ...pruneFeedback(ex), settings: { ...DEFAULT_SETTINGS } }).written).toBe(1);
  });

  it('leaves a document with nothing orphaned untouched', () => {
    const ex = doc();
    expect(pruneFeedback(ex).feedback).toEqual(ex.feedback);
  });
});

// ── Odds and ends ───────────────────────────────────────────────────────────

describe('norm', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(norm('  Blir   VI  hjemme. ')).toBe('blir vi hjemme.');
  });

  it('leaves Norwegian letters alone', () => {
    // AC-X5. Folding these would make "får" and "far" the same word.
    expect(norm('Får')).toBe('får');
    expect(norm('Får')).not.toBe(norm('far'));
    expect(norm('ØSTOVER')).toBe('østover');
  });
});

describe('shuffled', () => {
  it('is a permutation, and the same one for the same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const once = shuffled(items, 42);
    expect([...once].sort()).toEqual([...items].sort());
    expect(shuffled(items, 42)).toEqual(once);
  });

  it('reorders for a different seed, and does not touch the input', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffled(items, 7)).not.toEqual(shuffled(items, 8));
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('survives a zero seed rather than standing still', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffled(items, 0)).toHaveLength(6);
  });
});
