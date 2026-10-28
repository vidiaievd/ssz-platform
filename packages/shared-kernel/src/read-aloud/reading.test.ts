// The reading check (plan 82, Q4 and Q7).

import { describe, expect, it } from 'vitest';

import { sampleDocument } from './fixture.js';
import { readContent } from './persistence.js';
import {
  accuracyPercent,
  checkReading,
  clampPassPercent,
  DEFAULT_READING_PASS_PERCENT,
  machineCanCheck,
  readingPasses,
  readingVerdict,
  wordsPerMinute,
} from './reading.js';
import type { ReadingOp } from './reading.js';

const PASSAGE = 'Jeg bor i en liten leilighet i Bergen.';

function kinds(ops: readonly ReadingOp[]): string[] {
  return ops.map((o) => (o.k === 'extra' ? `+${o.heard}` : o.k === 'read' && o.n > 1 ? `read×${o.n}` : o.k));
}

describe('checkReading', () => {
  it('counts a passage read word for word, ignoring case and punctuation', () => {
    const check = checkReading(PASSAGE, 'jeg bor i en liten leilighet i bergen', 'nb');
    expect(check).toMatchObject({ total: 8, read: 8, misread: 0, missed: 0, extra: 0, accuracy: 1 });
  });

  it('charges a missed word and a misread one', () => {
    const check = checkReading(PASSAGE, 'Jeg bor i en lita leilighet Bergen', 'nb');
    expect(check).toMatchObject({ total: 8, read: 6, misread: 1, missed: 1 });
    expect(check.ops.find((o) => o.k === 'misread')).toMatchObject({ expected: 'liten', heard: 'lita' });
    expect(check.ops.find((o) => o.k === 'missed')).toMatchObject({ i: 6, expected: 'i' });
  });

  it('does not charge repeats and self-corrections', () => {
    const check = checkReading(PASSAGE, 'Jeg bor bor i en lille liten leilighet i Bergen', 'nb');
    expect(check).toMatchObject({ read: 8, misread: 0, missed: 0, extra: 2, accuracy: 1 });
  });

  it('pairs what was heard instead of a word with that word, in passage order', () => {
    expect(kinds(checkReading('a b c d', 'a x d', 'nb').ops)).toEqual(['read', 'misread', 'missed', 'read']);
  });

  it('reads the recognizer gluing or splitting a compound as read', () => {
    // `e-post` is one token of the kernel tokenizer: five words.
    expect(checkReading('Send en e-post i morgen', 'send en epost imorgen', 'nb')).toMatchObject({
      total: 5,
      read: 5,
      accuracy: 1,
    });
    expect(kinds(checkReading('i morgen tidlig', 'imorgentidlig', 'nb').ops)).toEqual(['read×3']);
    expect(checkReading('fotballkamp', 'fotball kamp', 'nb')).toMatchObject({ read: 1, extra: 0 });
  });

  it('reads a number heard as digits as the number word', () => {
    expect(checkReading('Hun har tre barn og ett hus', 'hun har 3 barn og 1 hus', 'nb').accuracy).toBe(1);
    expect(checkReading('Vi er 20', 'vi er tjue', 'nb').accuracy).toBe(1);
    // Another language has no table: digits are words like any other.
    expect(checkReading('three cats', '3 cats', 'en').read).toBe(1);
  });

  it('flags focus words, whatever happened to them', () => {
    const check = checkReading(PASSAGE, 'Jeg bor i en liten Bergen', 'nb', [{ word: 'Leilighet' }, { word: 'bor' }]);
    expect(check.ops.filter((o) => 'focus' in o && o.focus).map((o) => o.k)).toEqual(['read', 'missed']);
  });

  it('gives an empty passage nothing to read', () => {
    expect(checkReading('', 'hei', 'nb')).toMatchObject({ total: 0, read: 0, extra: 1, accuracy: 0 });
    expect(checkReading(PASSAGE, '', 'nb')).toMatchObject({ read: 0, missed: 8, accuracy: 0 });
  });

  it('aligns the same strings the same way every time', () => {
    const a = checkReading('og og og', 'og x og', 'nb');
    expect(checkReading('og og og', 'og x og', 'nb')).toEqual(a);
  });
});

describe('the pass mark', () => {
  it('decides in whole numbers', () => {
    // 17 of 20 is exactly 85 %.
    expect(readingPasses({ read: 17, total: 20 }, 85)).toBe(true);
    expect(readingPasses({ read: 16, total: 20 }, 85)).toBe(false);
    // 6 of 7 is 85.7 %: passes, and shows as 85, never rounded up.
    expect(readingPasses({ read: 6, total: 7 }, 85)).toBe(true);
    expect(accuracyPercent({ read: 6, total: 7 })).toBe(85);
    expect(readingPasses({ read: 0, total: 0 }, 50)).toBe(false);
  });

  it('keeps the author inside 50–100', () => {
    expect(clampPassPercent(20)).toBe(50);
    expect(clampPassPercent(120)).toBe(100);
    expect(clampPassPercent(Number.NaN)).toBe(DEFAULT_READING_PASS_PERCENT);
    expect(clampPassPercent(84.6)).toBe(85);
  });
});

describe('readingVerdict', () => {
  const good = checkReading(PASSAGE, PASSAGE, 'nb');
  const poor = checkReading(PASSAGE, 'Jeg bor i Bergen', 'nb');

  it('passes the work when every prompt passes, and scores the mean accuracy', () => {
    const verdict = readingVerdict(
      [
        { itemId: 'p1', check: good },
        { itemId: 'p2', check: poor },
      ],
      85,
    );
    expect(verdict.prompts).toEqual([
      { itemId: 'p1', passed: true, percent: 100 },
      { itemId: 'p2', passed: false, percent: 50 },
    ]);
    expect(verdict).toMatchObject({ passed: false, score: 75 });
    expect(readingVerdict([{ itemId: 'p1', check: good }], 85)).toMatchObject({ passed: true, score: 100 });
  });

  it('passes nothing it did not check', () => {
    expect(readingVerdict([], 85)).toEqual({ prompts: [], passed: false, score: 0 });
  });
});

describe('wordsPerMinute', () => {
  it('is feedback over the speech heard', () => {
    expect(wordsPerMinute(40, 30)).toBe(80);
    expect(wordsPerMinute(40, 0)).toBeNull();
    expect(wordsPerMinute(0, 12)).toBeNull();
  });
});

describe('machineCanCheck', () => {
  const on = (patch: object = {}) => {
    const ex = sampleDocument();
    return { ...ex, review: { ...ex.review, aiStage: true }, ...patch };
  };

  it('checks `read` with the AI stage and the transcript on', () => {
    expect(machineCanCheck(on())).toBe(true);
    expect(machineCanCheck(sampleDocument())).toBe(false);
  });

  it('does not check another mode, a prompt without a passage, or without the transcript', () => {
    const ex = on();
    expect(machineCanCheck({ ...ex, mode: 'dialogue' })).toBe(false);
    expect(machineCanCheck({ ...ex, prompts: [...ex.prompts, { ...ex.prompts[0]!, text: ' — ' }] })).toBe(false);
    expect(machineCanCheck({ ...ex, review: { ...ex.review, ai: { ...ex.review.ai, transcript: false } } })).toBe(false);
  });
});

describe('the stored pass mark', () => {
  it('defaults a document written before plan 82 and clamps a stray value', () => {
    expect(readContent({ mode: 'read', review: { aiStage: true } }).review.readingPassPercent).toBe(85);
    expect(readContent({ mode: 'read', review: { readingPassPercent: 10 } }).review.readingPassPercent).toBe(50);
    expect(readContent({ mode: 'read', review: { readingPassPercent: 90 } }).review.readingPassPercent).toBe(90);
  });
});
