import { describe, expect, it } from 'vitest';

import type { ErrorCorrection } from './model.js';
import { DEFAULT_AI, DEFAULT_CHECK, DEFAULT_FLOW, DEFAULT_HINTS } from './model.js';
import {
  fromPersisted,
  readContent,
  readEdits,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

function document(overrides: Partial<ErrorCorrection> = {}): ErrorCorrection {
  return {
    id: 'ex1',
    type: 'error_correction',
    moduleId: 'm1',
    title: 'Finn feilen',
    instructions: 'Rett setningene.',
    updatedAt: '2026-08-12T00:00:00.000Z',
    mode: 'sentences',
    note: 'Fra leksjon 4.',
    items: [
      {
        id: 'i1',
        wrong: 'I går jeg gikk på kino.',
        ref: 'I går gikk jeg på kino.',
        alts: ['I går dro jeg på kino.'],
        meta: { '2:4:gikk jeg': { type: 'order', note: 'V2.' } },
        hint: 'Hva skjer med verbet?',
        teacherNote: 'V2-regelen.',
      },
    ],
    hints: { ...DEFAULT_HINTS },
    check: { ...DEFAULT_CHECK },
    flow: { ...DEFAULT_FLOW },
    ai: { ...DEFAULT_AI },
    ...overrides,
  };
}

/** Every string anywhere in the value, however deeply nested — keys included. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...allStrings(nested)]);
  }
  return [];
}

describe('the content / expected_answers split', () => {
  it('keeps the answer key out of the content column entirely', () => {
    const strings = allStrings(toContent(document()));

    expect(strings).toContain('I går jeg gikk på kino.');
    expect(strings).not.toContain('I går gikk jeg på kino.');
    expect(strings).not.toContain('I går dro jeg på kino.');
    expect(strings).not.toContain('V2-regelen.');
    // The span override names the fix in its own key, so it is an answer too.
    expect(strings).not.toContain('2:4:gikk jeg');
  });

  it('keeps the student-facing hint in the content column', () => {
    expect(allStrings(toContent(document()))).toContain('Hva skjer med verbet?');
  });

  it('keys the answers by item id, so reordering items cannot shuffle them', () => {
    const answers = toExpectedAnswers(document());

    expect(Object.keys(answers.items)).toEqual(['i1']);
    expect(answers.items['i1']).toMatchObject({
      ref: 'I går gikk jeg på kino.',
      teacherNote: 'V2-regelen.',
    });
  });

  it('round-trips a document through both columns', () => {
    const original = document();
    const restored = fromPersisted(
      {
        id: original.id,
        moduleId: original.moduleId,
        title: original.title,
        instructions: original.instructions,
        updatedAt: original.updatedAt,
      },
      toContent(original),
      toExpectedAnswers(original),
    );

    expect(restored).toEqual(original);
  });
});

describe('reading what the columns actually hold', () => {
  it('fills defaults rather than throwing on an empty content column', () => {
    const content = readContent(undefined);

    expect(content).toMatchObject({ mode: 'sentences', note: '', items: [] });
    expect(content.check).toEqual(DEFAULT_CHECK);
  });

  it('falls back to a known value for an unrecognised setting', () => {
    const content = readContent({ mode: 'essay', check: { strayEdits: 'delete' }, flow: { attempts: 7 } });

    expect(content.mode).toBe('sentences');
    expect(content.check.strayEdits).toBe(DEFAULT_CHECK.strayEdits);
    expect(content.flow.attempts).toBe(DEFAULT_FLOW.attempts);
  });

  it('clamps a stored self-check count into the 0–3 the handoff allows', () => {
    expect(readContent({ flow: { selfCheck: 9 } }).flow.selfCheck).toBe(3);
    expect(readContent({ flow: { selfCheck: -2 } }).flow.selfCheck).toBe(0);
  });

  it('drops an item without an answer key rather than inventing one', () => {
    const restored = fromPersisted(
      { id: 'ex1', moduleId: 'm1', title: '', instructions: '', updatedAt: '' },
      { items: [{ id: 'i1', wrong: 'Vi må å snakke.' }] },
      {},
    );

    expect(restored.items[0]).toMatchObject({ ref: '', alts: [], meta: {} });
  });
});

describe('readEdits', () => {
  it('turns the string keys JSON gives back into word indices', () => {
    const parsed = readEdits(JSON.parse('{"marked":{"2":true},"fix":{"2":"gikk"},"ins":{"1":"må"}}'));

    expect(parsed.marked[2]).toBe(true);
    expect(parsed.fix[2]).toBe('gikk');
    expect(parsed.ins[1]).toBe('må');
  });

  it('keeps an empty fix — it is how a word is struck out', () => {
    expect(readEdits({ fix: { 3: '' } }).fix[3]).toBe('');
  });

  it('ignores a key that could not address a word', () => {
    const parsed = readEdits({ marked: { '-1': true, x: true, '1.5': true, 4: true } });

    expect(Object.keys(parsed.marked)).toEqual(['4']);
  });

  it('is an empty answer, not a crash, for junk', () => {
    expect(readEdits('nonsense')).toEqual({ marked: {}, fix: {}, ins: {} });
  });
});
