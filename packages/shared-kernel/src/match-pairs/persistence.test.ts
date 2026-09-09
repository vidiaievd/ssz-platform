import { describe, expect, it } from 'vitest';

import type { MatchPairs } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import {
  fromPersisted,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

const envelope = {
  id: 'ex1',
  moduleId: 'm1',
  title: 'Setningshalvdeler',
  instructions: 'Sett sammen halvdelene.',
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const document: MatchPairs = {
  ...envelope,
  type: 'match_pairs',
  variant: 'halves',
  settings: { ...DEFAULT_SETTINGS },
  pairs: [
    { id: 'p1', rightId: 'q1', left: 'Hvis det regner i morgen,', right: 'blir vi hjemme.' },
    { id: 'p2', rightId: 'q2', left: 'Da vi var barn,', right: 'bodde vi i Bergen.' },
  ],
  distractors: [{ id: 'd1', text: 'vi bodde i Bergen.' }],
  feedback: {
    p2: { def: 'Se på ordstillingen.', why: 'Inversjon.', ov: { d1: { text: 'Feil.', origin: 'author' } } },
  },
};

describe('round trip', () => {
  it('restores the document from the two columns and the row', () => {
    const restored = fromPersisted(
      envelope,
      toContent(document),
      toExpectedAnswers(document),
    );
    expect(restored).toEqual(document);
  });

  it('keeps Norwegian letters unchanged through the round trip', () => {
    // AC-X5.
    const ex: MatchPairs = {
      ...document,
      pairs: [{ id: 'p1', rightId: 'q1', left: 'Får vi lov å gå?', right: 'Ja, på søndag.' }],
    };
    const restored = fromPersisted(envelope, toContent(ex), toExpectedAnswers(ex));
    expect(restored.pairs[0]).toEqual(ex.pairs[0]);
  });

  it('keeps the pairing in `content` and out of `expected_answers`', () => {
    // The spec rule "the answer is never stored twice": editing a right half moves the
    // answer, the pool chip and the matrix column in one edit, because there is only one
    // place it is written down.
    expect(JSON.stringify(toExpectedAnswers(document))).not.toContain('q1');
    expect(toContent(document).pairs[0]!.rightId).toBe('q1');
  });
});

describe('fromPersisted', () => {
  it('does not throw on junk, and reports nothing it cannot read', () => {
    const restored = fromPersisted(envelope, null, 'not an object');
    expect(restored).toMatchObject({ type: TEMPLATE_CODE, pairs: [], distractors: [], feedback: {} });
  });

  it('fills settings that were never stored', () => {
    expect(readContent({ settings: { shuffle: false } }).settings).toEqual({
      ...DEFAULT_SETTINGS,
      shuffle: false,
    });
  });

  it('defaults the variant to `pairs`, which is what every stored exercise is', () => {
    expect(readContent({}).variant).toBe('pairs');
    expect(readContent({ variant: 'halves' }).variant).toBe('halves');
    expect(readContent({ variant: 'nonsense' }).variant).toBe('pairs');
  });

  it('treats an override with no recorded origin as the teacher own writing', () => {
    const restored = fromPersisted(envelope, {}, { feedback: { p1: { ov: { d1: { text: 'a' } } } } });
    expect(restored.feedback['p1']!.ov['d1']).toEqual({ text: 'a', origin: 'author' });
  });

  it('mints a right id for a pair saved before the field existed', () => {
    const restored = readContent({ pairs: [{ id: 'p1', left: 'a', right: 'b' }] });
    expect(restored.pairs[0]!.rightId).toBe('qp1');
    expect(restored.pairs[0]!.rightId).not.toBe(restored.pairs[0]!.id);
  });
});

describe('the shape this type had before plan 49', () => {
  const legacyContent = {
    left_items: [
      { id: 'l1', text: 'fordi' },
      { id: 'l2', text: 'selv om' },
      { id: 'l3', text: 'hvis' },
    ],
    right_items: [
      { id: 'r1', text: 'потому что' },
      { id: 'r2', text: 'хотя' },
      { id: 'r3', text: 'если' },
    ],
  };

  // The real answer key of `g17-match-subjunksjon`, which is deliberately not the
  // identity mapping: the right column was written out of order so the answers were not
  // simply "first with first".
  const legacyAnswers = {
    pairs: [
      { left_id: 'l1', right_id: 'r2' },
      { left_id: 'l2', right_id: 'r3' },
      { left_id: 'l3', right_id: 'r1' },
    ],
  };

  it('takes the pairing from the answer key, not from the position in the two lists', () => {
    // The bug this test exists for: five of the seventeen seeded exercises pair
    // out of order, and reading by position gave every one of them the wrong answer.
    expect(readContent(legacyContent, legacyAnswers).pairs).toEqual([
      { id: 'l1', rightId: 'ql1', left: 'fordi', right: 'хотя' },
      { id: 'l2', rightId: 'ql2', left: 'selv om', right: 'если' },
      { id: 'l3', rightId: 'ql3', left: 'hvis', right: 'потому что' },
    ]);
  });

  it('reads the same document through fromPersisted, which always has the key', () => {
    const restored = fromPersisted(envelope, legacyContent, legacyAnswers);
    expect(restored.pairs.map((pair) => pair.right)).toEqual(['хотя', 'если', 'потому что']);
  });

  it('falls back to position only when no key is available at all', () => {
    // A guess, and documented as one: a caller holding the content column alone has
    // nothing better. Every call site inside the platform passes the answers.
    expect(readContent(legacyContent).pairs.map((pair) => pair.right)).toEqual([
      'потому что',
      'хотя',
      'если',
    ]);
  });

  it('leaves a left half whose key names a right item that is gone with an empty half', () => {
    const dangling = { pairs: [{ left_id: 'l1', right_id: 'r9' }] };
    // Empty rather than silently positional: `PAIR_HALF_EMPTY` then puts it in front of
    // the teacher instead of quietly inventing an answer.
    expect(readContent(legacyContent, dangling).pairs[0]!.right).toBe('');
  });

  it('does not reuse the legacy right id, which announced the answer', () => {
    // `r1` is "answer number one" said out loud, and this id is shipped to the student.
    const ids = readContent(legacyContent).pairs.map((pair) => pair.rightId);
    expect(ids).not.toContain('r1');
  });

  it('reads a legacy document as `pairs`, never as `halves`', () => {
    expect(readContent(legacyContent).variant).toBe('pairs');
  });

  it('survives right_items shorter than left_items', () => {
    const ragged = { ...legacyContent, right_items: [{ id: 'r1', text: 'потому что' }] };
    expect(readContent(ragged).pairs.map((pair) => pair.right)).toEqual(['потому что', '', '']);
  });

  it('prefers the new shape when both are present', () => {
    const both = { ...legacyContent, pairs: [{ id: 'p9', rightId: 'q9', left: 'ny', right: 'form' }] };
    expect(readContent(both, legacyAnswers).pairs).toEqual([
      { id: 'p9', rightId: 'q9', left: 'ny', right: 'form' },
    ]);
  });
});
