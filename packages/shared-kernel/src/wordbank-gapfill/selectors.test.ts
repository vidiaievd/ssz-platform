import { describe, expect, it } from 'vitest';

import type { GapFeedback, Sentence, WordBankGapFill } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import {
  answers,
  bank,
  core,
  coverage,
  equals,
  gapKey,
  gaps,
  grade,
  pruneFeedback,
  tokens,
  withSentenceText,
} from './selectors.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function feedback(partial: Partial<GapFeedback> = {}): GapFeedback {
  return { fallback: '', why: '', pairs: {}, ...partial };
}

function authored(text: string) {
  return { text, origin: 'author' as const };
}

function makeExercise(overrides: Partial<WordBankGapFill> = {}): WordBankGapFill {
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
      's1#3': feedback({
        fallback: 'This gap needs an infinitive.',
        why: 'After «vil gjerne» the verb stays in the infinitive.',
        pairs: { bestilt: authored('«bestilt» is the past participle and needs «har».') },
      }),
      's2#3': feedback({ fallback: 'Check the form of the noun.' }),
    },
    updatedAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

// ── core() — bug site 1 ─────────────────────────────────────────────────────
//
// The spec warns that this is where bugs live: it must strip the punctuation that
// surrounds a token, and touch nothing else. Norwegian letters are letters.

describe('core', () => {
  it('strips the surrounding punctuation the spec lists', () => {
    expect(core('regningen,')).toBe('regningen');
    expect(core('kaffe.')).toBe('kaffe');
    expect(core('takk?')).toBe('takk');
    expect(core('Hei!')).toBe('Hei');
    expect(core('«bestille»')).toBe('bestille');
    expect(core('"meny"')).toBe('meny');
    expect(core("'meny'")).toBe('meny');
    expect(core('(menyen)')).toBe('menyen');
    expect(core('[bestille]')).toBe('bestille');
    expect(core('slik:')).toBe('slik');
    expect(core('slik;')).toBe('slik');
    expect(core('«regningen»,')).toBe('regningen');
  });

  it('leaves æ ø å alone', () => {
    expect(core('på')).toBe('på');
    expect(core('blåbær.')).toBe('blåbær');
    expect(core('«nærmere»')).toBe('nærmere');
    expect(core('brød,')).toBe('brød');
    expect(core('Ærlig')).toBe('Ærlig');
    expect(core('Øst')).toBe('Øst');
    expect(core('Ås')).toBe('Ås');
  });

  it('does not normalise diacritics, in either direction', () => {
    // Precomposed å (U+00E5) must not decompose…
    const precomposed = 'på';
    expect([...core(precomposed)].map((c) => c.codePointAt(0))).toEqual([0x70, 0x00e5]);

    // …and decomposed a + combining ring (U+0061 U+030A) must not compose.
    const decomposed = 'på.';
    expect([...core(decomposed)].map((c) => c.codePointAt(0))).toEqual([0x70, 0x61, 0x030a]);

    // Non-Norwegian diacritics are equally untouched: no ASCII folding.
    expect(core('café,')).toBe('café');
    expect(core('naïve')).toBe('naïve');
  });

  it('leaves punctuation inside a token alone', () => {
    expect(core('kl.10')).toBe('kl.10');
    expect(core('over-tid')).toBe('over-tid');
    expect(core("it's")).toBe("it's");
  });

  it('returns an empty string for a token that is only punctuation', () => {
    expect(core('...')).toBe('');
    expect(core('—')).toBe('—'); // em dash is not in the spec's set
  });
});

describe('tokens', () => {
  it('splits on whitespace and collapses runs', () => {
    expect(tokens('Jeg  vil\tgjerne\nbestille')).toEqual(['Jeg', 'vil', 'gjerne', 'bestille']);
  });

  it('is empty for empty or blank text, never [""]', () => {
    expect(tokens('')).toEqual([]);
    expect(tokens('   \n ')).toEqual([]);
  });
});

// ── gaps / answers / bank ───────────────────────────────────────────────────

describe('gaps', () => {
  it('labels in document order and derives the answer from the token', () => {
    expect(gaps(makeExercise()).map((g) => [g.label, g.key, g.answer])).toEqual([
      ['G1', 's1#3', 'bestille'],
      ['G2', 's2#3', 'regningen'],
    ]);
  });

  it('orders gaps within a sentence by token index, whatever the stored order', () => {
    const ex = makeExercise({
      sentences: [{ id: 's1', text: 'Servitøren kommer med menyen straks.', gaps: [3, 0] }],
      feedback: {},
    });
    expect(gaps(ex).map((g) => [g.label, g.tokenIndex])).toEqual([
      ['G1', 0],
      ['G2', 3],
    ]);
  });

  it('renumbers labels when sentences are reordered, keeping the keys', () => {
    const base = makeExercise();
    const [first, second] = base.sentences as [Sentence, Sentence];
    const reordered = makeExercise({ sentences: [second, first] });
    expect(gaps(reordered).map((g) => [g.label, g.key])).toEqual([
      ['G1', 's2#3'],
      ['G2', 's1#3'],
    ]);
  });

  it('ignores stale and duplicated token indices', () => {
    const ex = makeExercise({
      sentences: [{ id: 's1', text: 'Jeg vil gjerne bestille.', gaps: [3, 3, 9] }],
      feedback: {},
    });
    expect(gaps(ex).map((g) => g.key)).toEqual(['s1#3']);
  });
});

describe('answers and bank', () => {
  it('lists unique answers in document order', () => {
    const ex = makeExercise({
      sentences: [
        { id: 's1', text: 'Jeg vil gjerne bestille.', gaps: [3] },
        { id: 's2', text: 'Vi skal bestille senere.', gaps: [2] },
        { id: 's3', text: 'Kan jeg få regningen?', gaps: [3] },
      ],
      feedback: {},
    });
    expect(answers(ex)).toEqual(['bestille', 'regningen']);
  });

  it('puts answers before distractors and marks which is which', () => {
    expect(bank(makeExercise())).toEqual([
      { word: 'bestille', isAnswer: true },
      { word: 'regningen', isAnswer: true },
      { word: 'bestilt', isAnswer: false },
      { word: 'regning', isAnswer: false },
    ]);
  });

  it('drops distractors that are really an answer, blanks and repeats', () => {
    const ex = makeExercise({ distractors: ['bestille', '  ', 'bestilt', 'bestilt'] });
    expect(bank(ex).map((w) => w.word)).toEqual(['bestille', 'regningen', 'bestilt']);
  });

  it('treats a differently-cased distractor as the answer unless caseSensitive', () => {
    const insensitive = makeExercise({ distractors: ['Bestille'] });
    expect(bank(insensitive).map((w) => w.word)).toEqual(['bestille', 'regningen']);

    const sensitive = makeExercise({
      distractors: ['Bestille'],
      settings: { ...DEFAULT_SETTINGS, caseSensitive: true },
    });
    expect(bank(sensitive).map((w) => w.word)).toEqual(['bestille', 'regningen', 'Bestille']);
  });
});

describe('coverage', () => {
  it('counts one pair per gap per wrong bank word', () => {
    // 2 gaps × (4 bank words − its own answer) = 6 pairs, 1 written.
    expect(coverage(makeExercise())).toMatchObject({
      total: 6,
      written: 1,
      noFallback: 0,
      gaps: 2,
    });
  });

  it('does not count an unaccepted AI draft as written', () => {
    const ex = makeExercise();
    ex.feedback['s2#3'] = feedback({
      fallback: 'Check the form of the noun.',
      pairs: { bestilt: { text: 'draft', origin: 'ai_draft' } },
    });
    expect(coverage(ex)).toMatchObject({ total: 6, written: 1 });
  });

  it('counts gaps missing a default explanation', () => {
    const ex = makeExercise({ feedback: { 's1#3': feedback({ fallback: '   ' }) } });
    expect(coverage(ex).noFallback).toBe(2);
  });

  it('has nothing to cover in free mode, where pairs never reach the student', () => {
    const ex = makeExercise({ settings: { ...DEFAULT_SETTINGS, input: 'free' } });
    expect(coverage(ex)).toMatchObject({ total: 0, written: 0, pct: 0, gaps: 2 });
  });
});

// ── equals ──────────────────────────────────────────────────────────────────

describe('equals', () => {
  it('is case-insensitive by default and sensitive on request', () => {
    expect(equals('Bestille', 'bestille')).toBe(true);
    expect(equals('Bestille', 'bestille', true)).toBe(false);
  });

  it('normalises to NFC so æ ø å survive either encoding', () => {
    expect(equals('på', 'på')).toBe(true);
    expect(equals('brød', 'brød')).toBe(true);
  });

  it('does not fold diacritics away', () => {
    expect(equals('på', 'pa')).toBe(false);
    expect(equals('brød', 'brod')).toBe(false);
    expect(equals('café', 'cafe')).toBe(false);
  });

  it('trims but does not accept a different word', () => {
    expect(equals('  bestille ', 'bestille')).toBe(true);
    expect(equals('sikker', 'sikkert')).toBe(false);
  });
});

// ── grade ───────────────────────────────────────────────────────────────────

describe('grade', () => {
  it('prefers the pair explanation over the fallback', () => {
    const results = grade(makeExercise(), [
      { gapKey: 's1#3', word: 'bestilt' },
      { gapKey: 's2#3', word: 'regning' },
    ]);
    expect(results).toEqual([
      {
        gapKey: 's1#3',
        correct: false,
        explanation: '«bestilt» is the past participle and needs «har».',
      },
      { gapKey: 's2#3', correct: false, explanation: 'Check the form of the noun.' },
    ]);
  });

  it('answers a correct gap with the "why", or null when there is none', () => {
    const results = grade(makeExercise(), [
      { gapKey: 's1#3', word: 'bestille' },
      { gapKey: 's2#3', word: 'regningen' },
    ]);
    expect(results).toEqual([
      {
        gapKey: 's1#3',
        correct: true,
        explanation: 'After «vil gjerne» the verb stays in the infinitive.',
      },
      { gapKey: 's2#3', correct: true, explanation: null },
    ]);
  });

  it('never shows an unaccepted AI draft to a student', () => {
    const ex = makeExercise();
    ex.feedback['s1#3'] = feedback({
      fallback: 'This gap needs an infinitive.',
      pairs: { bestilt: { text: 'draft, not accepted', origin: 'ai_draft' } },
    });
    expect(grade(ex, [{ gapKey: 's1#3', word: 'bestilt' }])[0]).toEqual({
      gapKey: 's1#3',
      correct: false,
      explanation: 'This gap needs an infinitive.',
    });
  });

  it('grades every gap, including the ones left empty', () => {
    const results = grade(makeExercise(), [{ gapKey: 's1#3', word: 'bestille' }]);
    expect(results.map((r) => [r.gapKey, r.correct])).toEqual([
      ['s1#3', true],
      ['s2#3', false],
    ]);
  });

  it('ignores punctuation the student typed around the word', () => {
    const ex = makeExercise({
      settings: { ...DEFAULT_SETTINGS, input: 'free' },
      sentences: [{ id: 's1', text: 'Jeg er sikker på det.', gaps: [2] }],
      feedback: { 's1#2': feedback({ fallback: 'Which adjective form fits here?' }) },
    });
    expect(grade(ex, [{ gapKey: 's1#2', word: 'sikker' }])[0]?.correct).toBe(true);
    expect(grade(ex, [{ gapKey: 's1#2', word: 'sikker.' }])[0]?.correct).toBe(true);
    expect(grade(ex, [{ gapKey: 's1#2', word: 'sikkert' }])[0]?.correct).toBe(false);
  });

  describe('free mode', () => {
    const freeExercise = () =>
      makeExercise({
        settings: { ...DEFAULT_SETTINGS, input: 'free' },
        alternatives: { 's1#3': ['å bestille'] },
      });

    it('accepts a listed alternative spelling', () => {
      expect(grade(freeExercise(), [{ gapKey: 's1#3', word: 'å bestille' }])[0]?.correct).toBe(
        true,
      );
    });

    it('falls back to the default explanation, ignoring the pair matrix', () => {
      expect(grade(freeExercise(), [{ gapKey: 's1#3', word: 'bestilt' }])[0]).toEqual({
        gapKey: 's1#3',
        correct: false,
        explanation: 'This gap needs an infinitive.',
      });
    });
  });

  it('does not honour alternatives in bank mode, where the set is closed', () => {
    const ex = makeExercise({ alternatives: { 's1#3': ['bestilt'] } });
    expect(grade(ex, [{ gapKey: 's1#3', word: 'bestilt' }])[0]?.correct).toBe(false);
  });
});

// ── withSentenceText() — bug site 2 ─────────────────────────────────────────
//
// "Editing sentence.text drops gap indices >= tokens.length" (SPEC_data_model), and
// AC-B5 adds that the dropped gap takes its feedback entry with it while the survivors
// keep theirs.

describe('withSentenceText', () => {
  const twoGaps = () =>
    makeExercise({
      sentences: [{ id: 's1', text: 'Servitøren kommer med menyen straks.', gaps: [0, 3] }],
      distractors: ['servitør', 'meny'],
      feedback: {
        's1#0': feedback({
          fallback: 'definite form',
          pairs: { servitør: authored('indefinite') },
        }),
        's1#3': feedback({ fallback: 'definite form', pairs: { meny: authored('indefinite') } }),
      },
      alternatives: { 's1#0': ['servitøren'], 's1#3': ['menyen'] },
    });

  it('drops the gaps the shortened text no longer has, and their feedback', () => {
    const edited = withSentenceText(twoGaps(), 's1', 'Servitøren kommer.');
    expect(edited.sentences[0]?.gaps).toEqual([0]);
    expect(Object.keys(edited.feedback)).toEqual(['s1#0']);
    expect(Object.keys(edited.alternatives ?? {})).toEqual(['s1#0']);
  });

  it('keeps the explanations of the gaps that survive', () => {
    const edited = withSentenceText(twoGaps(), 's1', 'Servitøren kommer.');
    expect(edited.feedback['s1#0']).toEqual(
      feedback({ fallback: 'definite form', pairs: { servitør: authored('indefinite') } }),
    );
  });

  it('re-derives the answer when the word at a surviving index changes', () => {
    const edited = withSentenceText(twoGaps(), 's1', 'Kelneren kommer med menyen straks.');
    expect(gaps(edited).map((g) => g.answer)).toEqual(['Kelneren', 'menyen']);
  });

  it('keeps every gap when the text only grows', () => {
    const edited = withSentenceText(twoGaps(), 's1', 'Servitøren kommer med menyen straks igjen.');
    expect(edited.sentences[0]?.gaps).toEqual([0, 3]);
    expect(Object.keys(edited.feedback).sort()).toEqual(['s1#0', 's1#3']);
  });

  it('drops every gap when the text is emptied', () => {
    const edited = withSentenceText(twoGaps(), 's1', '   ');
    expect(edited.sentences[0]?.gaps).toEqual([]);
    expect(edited.feedback).toEqual({});
  });

  it('does not mutate the exercise it was given', () => {
    const before = twoGaps();
    withSentenceText(before, 's1', 'Servitøren kommer.');
    expect(before.sentences[0]?.gaps).toEqual([0, 3]);
    expect(Object.keys(before.feedback).sort()).toEqual(['s1#0', 's1#3']);
  });

  it('leaves other sentences alone', () => {
    const edited = withSentenceText(makeExercise(), 's1', 'Jeg vil gjerne bestille.');
    expect(edited.sentences[1]).toEqual(makeExercise().sentences[1]);
  });
});

// ── pruneFeedback() — bug site 3 ────────────────────────────────────────────
//
// Pair explanations are keyed by word *text*, so renaming a word orphans them. The spec
// says to drop the orphans on save, silently: the teacher already sees the coverage
// number change, and a confirmation prompt for a rename would be noise.

describe('pruneFeedback', () => {
  it('drops pair keys that are no longer in the bank, silently', () => {
    const ex = makeExercise();
    ex.feedback['s1#3'] = feedback({
      fallback: 'This gap needs an infinitive.',
      pairs: {
        bestilt: authored('still a distractor'),
        bestilling: authored('orphaned: no longer in the bank'),
      },
    });

    const pruned = pruneFeedback(ex);
    expect(Object.keys(pruned.feedback['s1#3']?.pairs ?? {})).toEqual(['bestilt']);
  });

  it('drops the pair a rename turned into the answer of its own gap', () => {
    // The teacher rewrites the sentence so that «bestilt» is now the correct word.
    // Its column still holds "why bestilt is wrong here" — which is now nonsense.
    const ex = makeExercise({
      sentences: [{ id: 's1', text: 'Jeg har bestilt en kaffe.', gaps: [2] }],
      distractors: ['bestille'],
      feedback: {
        's1#2': feedback({
          fallback: 'Check the verb form.',
          pairs: { bestilt: authored('stale'), bestille: authored('kept') },
        }),
      },
    });
    expect(Object.keys(pruneFeedback(ex).feedback['s1#2']?.pairs ?? {})).toEqual(['bestille']);
  });

  it('drops feedback and alternatives for gaps that no longer exist', () => {
    const ex = makeExercise({
      feedback: {
        's1#3': feedback({ fallback: 'kept' }),
        's2#3': feedback({ fallback: 'kept' }),
        's9#0': feedback({ fallback: 'the sentence was deleted' }),
      },
      alternatives: { 's1#3': ['å bestille'], 's9#0': ['ghost'] },
    });

    const pruned = pruneFeedback(ex);
    expect(Object.keys(pruned.feedback).sort()).toEqual(['s1#3', 's2#3']);
    expect(Object.keys(pruned.alternatives ?? {})).toEqual(['s1#3']);
  });

  it('keeps a document that is already clean byte for byte', () => {
    const ex = makeExercise();
    expect(pruneFeedback(ex)).toEqual(ex);
  });

  it('does not mutate the exercise it was given', () => {
    const ex = makeExercise();
    ex.feedback['s1#3'] = feedback({ pairs: { bestilling: authored('orphan') } });
    pruneFeedback(ex);
    expect(Object.keys(ex.feedback['s1#3']?.pairs ?? {})).toEqual(['bestilling']);
  });
});

describe('gapKey', () => {
  it('joins the sentence id and the token index', () => {
    expect(gapKey('s1', 3)).toBe('s1#3');
  });
});
