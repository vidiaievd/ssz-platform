import { describe, expect, it } from 'vitest';

import type { DocumentEnvelope } from './persistence.js';
import { fromPersisted, toContent, toExpectedAnswers } from './persistence.js';
import type { WordBankGapFill } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import { answers, gaps } from './selectors.js';

const envelope: DocumentEnvelope = {
  id: 'ex-wb-1',
  moduleId: 'mod-1',
  title: 'På kafé — fyll inn ordene',
  instructions: 'Fyll inn de manglende ordene.',
  updatedAt: '2026-08-05T10:00:00.000Z',
};

function makeExercise(overrides: Partial<WordBankGapFill> = {}): WordBankGapFill {
  return {
    ...envelope,
    type: 'word_bank_gap_fill',
    settings: { ...DEFAULT_SETTINGS },
    sentences: [
      { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3], hint: 'infinitiv' },
    ],
    distractors: ['bestilt'],
    feedback: {
      's1#3': {
        fallback: 'This gap needs an infinitive.',
        why: 'After «vil gjerne» the verb stays in the infinitive.',
        pairs: { bestilt: { text: 'past participle', origin: 'author' } },
      },
    },
    ...overrides,
  };
}

describe('round trip', () => {
  it('survives storage and reload unchanged', () => {
    const before = makeExercise({ alternatives: { 's1#3': ['å bestille'] } });
    const after = fromPersisted(envelope, toContent(before), toExpectedAnswers(before));
    expect(after).toEqual(before);
  });

  it('does not invent an alternatives map for an exercise that has none', () => {
    const before = makeExercise();
    const after = fromPersisted(envelope, toContent(before), toExpectedAnswers(before));
    expect(after.alternatives).toBeUndefined();
  });

  it('keeps the answers out of the answers column — they live in the text', () => {
    const stored = JSON.stringify(toExpectedAnswers(makeExercise()));
    expect(stored).not.toContain('bestille');
    expect(JSON.stringify(toContent(makeExercise()))).toContain('bestille');
  });
});

describe('fromPersisted', () => {
  it('reads an exercise stored by an older writer, filling settings from the defaults', () => {
    const loaded = fromPersisted(
      envelope,
      { sentences: [{ id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] }] },
      {},
    );
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS);
    expect(loaded.distractors).toEqual([]);
    expect(loaded.feedback).toEqual({});
    expect(answers(loaded)).toEqual(['bestille']);
  });

  it("treats a pair with no recorded origin as the teacher's own", () => {
    // The field was added before AI drafting existed, so anything without it was typed
    // by a human. Reading it as a draft would hide their explanation from students.
    const loaded = fromPersisted(
      envelope,
      {},
      { feedback: { 's1#3': { pairs: { x: { text: 'a' } } } } },
    );
    expect(loaded.feedback['s1#3']?.pairs['x']).toEqual({ text: 'a', origin: 'author' });
  });

  it('never throws on a column that is not the shape it expects', () => {
    for (const junk of [null, undefined, 42, 'a string', [], { sentences: 'nope' }]) {
      expect(() => fromPersisted(envelope, junk, junk)).not.toThrow();
    }
    expect(fromPersisted(envelope, null, null).sentences).toEqual([]);
  });

  it('drops gap indices that could not address a token', () => {
    const loaded = fromPersisted(
      envelope,
      {
        sentences: [{ id: 's1', text: 'Jeg vil gjerne bestille.', gaps: [3, -1, 1.5, '2', null] }],
      },
      {},
    );
    expect(loaded.sentences[0]?.gaps).toEqual([3]);
    expect(gaps(loaded).map((gap) => gap.key)).toEqual(['s1#3']);
  });

  it('falls back to the bank mode for an unrecognised input setting', () => {
    const loaded = fromPersisted(envelope, { settings: { input: 'dictation' } }, {});
    expect(loaded.settings.input).toBe('bank');
  });

  it('keeps æ ø å byte for byte through a JSON round trip (AC-X5)', () => {
    const before = makeExercise({
      sentences: [{ id: 's1', text: 'Vi spiser blåbær og brød på hytta.', gaps: [2] }],
      feedback: { 's1#2': { fallback: 'Hvilket bær?', why: 'blåbær', pairs: {} } },
    });
    const roundTripped = JSON.parse(JSON.stringify(toContent(before))) as unknown;
    const after = fromPersisted(envelope, roundTripped, toExpectedAnswers(before));
    expect(answers(after)).toEqual(['blåbær']);
    expect([...(answers(after)[0] ?? '')].map((c) => c.codePointAt(0))).toEqual([
      0x62, 0x6c, 0x00e5, 0x62, 0x00e6, 0x72,
    ]);
  });
});
