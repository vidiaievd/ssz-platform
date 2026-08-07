import { describe, expect, it } from 'vitest';

import type { Issue, IssueCode } from './issues.js';
import { blockers, isReady, issues, warnings } from './issues.js';
import type { GapFeedback, PairFeedback, WordBankGapFill } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

// ── Fixture ─────────────────────────────────────────────────────────────────
//
// A document with nothing wrong with it: two gaps, a bank of four, every gap with a
// default explanation and a "why", and every pair written. Each test below breaks
// exactly one thing, so an unexpected extra code is a real finding rather than noise.

function authored(text: string): PairFeedback {
  return { text, origin: 'author' };
}

function pairs(...words: string[]): GapFeedback['pairs'] {
  return Object.fromEntries(words.map((word) => [word, authored(`why not ${word}`)]));
}

function makeReadyExercise(overrides: Partial<WordBankGapFill> = {}): WordBankGapFill {
  return {
    id: 'ex-wb-1',
    type: 'word_bank_gap_fill',
    moduleId: 'mod-1',
    title: 'På kafé — fyll inn ordene',
    instructions: 'Fyll inn de manglende ordene.',
    settings: { ...DEFAULT_SETTINGS },
    sentences: [
      { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] },
      { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3] },
    ],
    distractors: ['bestilt', 'regning'],
    feedback: {
      's1#3': {
        fallback: 'This gap needs an infinitive.',
        why: 'After «vil gjerne» the verb stays in the infinitive.',
        pairs: pairs('regningen', 'bestilt', 'regning'),
      },
      's2#3': {
        fallback: 'Check the form of the noun.',
        why: 'Your own bill is a specific thing, so it takes the definite form.',
        pairs: pairs('bestille', 'bestilt', 'regning'),
      },
    },
    updatedAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

const codesOf = (list: Issue[]): IssueCode[] => list.map((issue) => issue.code);

describe('the fixture itself', () => {
  it('has nothing wrong with it', () => {
    expect(issues(makeReadyExercise())).toEqual([]);
    expect(isReady(makeReadyExercise())).toBe(true);
  });
});

// ── Step 1 ──────────────────────────────────────────────────────────────────

describe('step 1 — sentences and gaps', () => {
  it('EX_NO_TITLE when the title is blank', () => {
    expect(issues(makeReadyExercise({ title: '   ' }))).toEqual([
      { code: 'EX_NO_TITLE', level: 'blocker', step: 1 },
    ]);
  });

  it('EX_NO_SENTENCES when there are none, without inventing gap problems', () => {
    const ex = makeReadyExercise({ sentences: [], feedback: {} });
    expect(issues(ex)).toEqual([{ code: 'EX_NO_SENTENCES', level: 'blocker', step: 1 }]);
  });

  it('SENT_EMPTY names the sentence, and does not also report a missing gap', () => {
    const ex = makeReadyExercise();
    ex.sentences[1] = { id: 's2', text: '   ', gaps: [3] };
    expect(issues(ex).filter((issue) => issue.step === 1)).toEqual([
      { code: 'SENT_EMPTY', level: 'blocker', step: 1, sentenceId: 's2', sentenceIndex: 1 },
    ]);
  });

  it('SENT_NO_GAP when a sentence has no gap marked', () => {
    const ex = makeReadyExercise();
    ex.sentences[1] = { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [] };
    expect(issues(ex).filter((issue) => issue.step === 1)).toEqual([
      { code: 'SENT_NO_GAP', level: 'blocker', step: 1, sentenceId: 's2', sentenceIndex: 1 },
    ]);
  });

  it('SENT_NO_GAP when every stored index is past the end of the text', () => {
    // The residue of an edit: the indices are there, the tokens are not.
    const ex = makeReadyExercise();
    ex.sentences[1] = { id: 's2', text: 'Takk!', gaps: [3] };
    expect(codesOf(issues(ex))).toContain('SENT_NO_GAP');
  });
});

// ── Step 2 ──────────────────────────────────────────────────────────────────

describe('step 2 — the word bank', () => {
  it('BANK_DUPLICATE when a distractor is really an answer', () => {
    const ex = makeReadyExercise({ distractors: ['bestilt', 'regning', 'bestille'] });
    expect(issues(ex).filter((issue) => issue.step === 2)).toContainEqual({
      code: 'BANK_DUPLICATE',
      level: 'blocker',
      step: 2,
      word: 'bestille',
    });
  });

  it('BANK_DUPLICATE catches a differently-cased answer unless caseSensitive', () => {
    const insensitive = makeReadyExercise({ distractors: ['bestilt', 'regning', 'Bestille'] });
    expect(codesOf(issues(insensitive))).toContain('BANK_DUPLICATE');

    const sensitive = makeReadyExercise({
      distractors: ['bestilt', 'regning', 'Bestille'],
      settings: { ...DEFAULT_SETTINGS, caseSensitive: true },
    });
    expect(codesOf(issues(sensitive))).not.toContain('BANK_DUPLICATE');
  });

  it('BANK_TOO_FEW when the bank offers no choice at all', () => {
    const ex = makeReadyExercise({
      sentences: [{ id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] }],
      distractors: [],
      feedback: { 's1#3': { fallback: 'needs an infinitive', why: 'because', pairs: {} } },
    });
    expect(issues(ex).filter((issue) => issue.step === 2)).toEqual([
      { code: 'BANK_TOO_FEW', level: 'blocker', step: 2, bankSize: 1 },
    ]);
  });

  it('BANK_TOO_SMALL when the bank has no spare words (AC-B14)', () => {
    const ex = makeReadyExercise({ distractors: ['bestilt'] });
    expect(issues(ex).filter((issue) => issue.step === 2)).toEqual([
      { code: 'BANK_TOO_SMALL', level: 'warning', step: 2, bankSize: 3, gapCount: 2 },
    ]);
  });

  it('does not warn about elimination when words may be reused', () => {
    // Seven words for ten gaps is the shape of b1-g1-wbf-01. Elimination is only an
    // exploit when each word is spent once.
    const ex = makeReadyExercise({
      distractors: ['bestilt'],
      settings: { ...DEFAULT_SETTINGS, allowReuse: true },
    });
    expect(codesOf(issues(ex))).not.toContain('BANK_TOO_SMALL');
  });

  it('reports neither bank problem when there are no gaps to fill yet', () => {
    const ex = makeReadyExercise({ sentences: [], distractors: [], feedback: {} });
    expect(codesOf(issues(ex))).toEqual(['EX_NO_SENTENCES']);
  });

  it('FB_PAIRS_UNUSED when free mode inherits a written pair matrix', () => {
    const ex = makeReadyExercise({ settings: { ...DEFAULT_SETTINGS, input: 'free' } });
    expect(issues(ex).filter((issue) => issue.step === 2)).toEqual([
      { code: 'FB_PAIRS_UNUSED', level: 'warning', step: 2, pairCount: 6 },
    ]);
  });

  it('leaves the bank rules alone in free mode, where there is no bank', () => {
    const ex = makeReadyExercise({
      settings: { ...DEFAULT_SETTINGS, input: 'free' },
      distractors: ['bestille'],
      feedback: {
        's1#3': { fallback: 'needs an infinitive', why: 'because', pairs: {} },
        's2#3': { fallback: 'definite form', why: 'because', pairs: {} },
      },
    });
    expect(issues(ex)).toEqual([]);
  });
});

// ── Step 3 ──────────────────────────────────────────────────────────────────

describe('step 3 — explanations', () => {
  it('FB_NO_FALLBACK per gap, with the label the teacher sees', () => {
    const ex = makeReadyExercise();
    ex.feedback['s2#3'] = { ...ex.feedback['s2#3']!, fallback: '  ' };
    expect(issues(ex).filter((issue) => issue.step === 3)).toEqual([
      { code: 'FB_NO_FALLBACK', level: 'blocker', step: 3, gapKey: 's2#3', label: 'G2' },
    ]);
  });

  it('FB_NO_FALLBACK for a gap with no feedback entry at all', () => {
    const ex = makeReadyExercise({ feedback: {} });
    expect(codesOf(issues(ex)).filter((code) => code === 'FB_NO_FALLBACK')).toHaveLength(2);
  });

  it('FB_NO_WHY is only a warning', () => {
    const ex = makeReadyExercise();
    ex.feedback['s1#3'] = { ...ex.feedback['s1#3']!, why: '' };
    expect(issues(ex).filter((issue) => issue.step === 3)).toEqual([
      { code: 'FB_NO_WHY', level: 'warning', step: 3, gapKey: 's1#3', label: 'G1' },
    ]);
    expect(isReady(ex)).toBe(true);
  });

  it('FB_PARTIAL_COVERAGE counts the pairs that fall back to the default', () => {
    const ex = makeReadyExercise();
    ex.feedback['s1#3'] = { ...ex.feedback['s1#3']!, pairs: pairs('bestilt') };
    expect(issues(ex).filter((issue) => issue.step === 3)).toEqual([
      { code: 'FB_PARTIAL_COVERAGE', level: 'warning', step: 3, written: 4, total: 6 },
    ]);
  });

  it('does not count an unaccepted AI draft as coverage', () => {
    const ex = makeReadyExercise();
    ex.feedback['s1#3'] = {
      ...ex.feedback['s1#3']!,
      pairs: { ...pairs('bestilt', 'regning'), regningen: { text: 'draft', origin: 'ai_draft' } },
    };
    expect(issues(ex).filter((issue) => issue.step === 3)).toEqual([
      { code: 'FB_PARTIAL_COVERAGE', level: 'warning', step: 3, written: 5, total: 6 },
    ]);
  });
});

// ── Readiness and ordering ──────────────────────────────────────────────────

describe('isReady', () => {
  it('is false exactly when a blocker exists', () => {
    expect(isReady(makeReadyExercise())).toBe(true);
    expect(isReady(makeReadyExercise({ title: '' }))).toBe(false);
    expect(isReady(makeReadyExercise({ distractors: ['bestilt'] }))).toBe(true); // warning only
  });

  it('agrees with the blockers list', () => {
    const broken = makeReadyExercise({ title: '', feedback: {} });
    expect(isReady(broken)).toBe(false);
    expect(blockers(broken)).toHaveLength(3); // no title + two gaps with no fallback
    expect(warnings(broken)).toHaveLength(3); // two gaps with no "why" + partial coverage
  });
});

describe('ordering', () => {
  it('is stable and follows the authoring steps, so two engines can be compared', () => {
    // Two answers and no distractors: a bank of two, which is a choice (so not
    // BANK_TOO_FEW) but a thin one, and a matrix of two pairs with nothing written.
    const broken = makeReadyExercise({ title: '', distractors: [], feedback: {} });
    expect(codesOf(issues(broken))).toEqual([
      'EX_NO_TITLE',
      'BANK_TOO_SMALL',
      'FB_NO_FALLBACK',
      'FB_NO_FALLBACK',
      'FB_NO_WHY',
      'FB_NO_WHY',
      'FB_PARTIAL_COVERAGE',
    ]);
  });

  it('names sentences and gaps in document order', () => {
    const ex = makeReadyExercise({ feedback: {} });
    expect(
      issues(ex)
        .filter((issue) => issue.code === 'FB_NO_FALLBACK')
        .map((issue) => issue.label),
    ).toEqual(['G1', 'G2']);
  });
});
