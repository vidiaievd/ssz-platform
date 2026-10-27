import { SAMPLE_PROMPT_IDS, sampleDocument, type SubmittedRecording } from '@ssz/shared-kernel/read-aloud';
import {
  checkReadings,
  readingComment,
  readingForView,
  readingRuling,
  type PromptHearing,
  type ReadingRulingInput,
} from '../../../src/modules/ai-drafts/domain/reading-verdict.js';

// Plan 82, step 7: the engine rules a reading from what was heard.

const [P1, P2] = SAMPLE_PROMPT_IDS;
const doc = sampleDocument();
const TEXT1 = doc.prompts[0]!.text;
const TEXT2 = doc.prompts[1]!.text;

/** The passage as a recognizer writes it: lower case, no punctuation. */
const lexical = (text: string) => text.toLowerCase().replace(/[.,]/g, '');

const hearing = (itemId: string, transcript: string, over: Partial<PromptHearing> = {}): PromptHearing => ({
  itemId,
  transcript,
  words: [],
  audioMs: 20000,
  pronunciation: null,
  aiCallId: null,
  ...over,
});

function input(over: Partial<ReadingRulingInput> = {}): ReadingRulingInput {
  return {
    language: 'nb',
    passPercent: 85,
    passages: [
      { itemId: P1, text: TEXT1, focus: ['søkte', 'Kjetil', 'Kirkegata'] },
      { itemId: P2, text: TEXT2, focus: ['hvert', 'tjue'] },
    ],
    recordings: [
      { itemId: P1, assetId: 'a1', seconds: 22, takes: 1 },
      { itemId: P2, assetId: 'a2', seconds: 14, takes: 1 },
    ],
    ...over,
  };
}

// 13 of 15: «hvert» and «tjue» not heard.
const P2_TWO_MISSED = 'bussen går kvarter hvis du kommer for sent må du vente i minutter';

describe('readingRuling', () => {
  it('approves when every prompt reaches the mark, scoring the mean accuracy', () => {
    const result = readingRuling(input(), [hearing(P1, lexical(TEXT1)), hearing(P2, P2_TWO_MISSED)]);
    if ('missing' in result) throw new Error('expected a ruling');

    expect(result.ruling).toMatchObject({
      outcome: 'approved',
      passed: true,
      // (100 + 86.67) / 2, rounded down.
      score: 93,
      approvedItems: 2,
      totalItems: 2,
      comment: null,
      gapResults: [
        { gapKey: P1, correct: true },
        { gapKey: P2, correct: true },
      ],
      evidenceLowered: true,
    });
    expect(result.ruling.decisions).toEqual([
      { itemId: P1, approved: true, comment: '23/23 · 100 % ≥ 85 %' },
      { itemId: P2, approved: true, comment: '13/15 · 86 % ≥ 85 %' },
    ]);
    expect(result.ruling).not.toHaveProperty('rubricMarks');
  });

  it('returns the work when one prompt falls short, and says so in figures', () => {
    const result = readingRuling(input({ passPercent: 90 }), [hearing(P1, lexical(TEXT1)), hearing(P2, P2_TWO_MISSED)]);
    if ('missing' in result) throw new Error('expected a ruling');

    expect(result.ruling).toMatchObject({ outcome: 'returned', passed: false, approvedItems: 1, totalItems: 2 });
    expect(result.ruling.decisions[1]).toEqual({ itemId: P2, approved: false, comment: '13/15 · 86 % < 90 %' });
    expect(result.ruling.gapResults).toEqual([
      { gapKey: P1, correct: true },
      { gapKey: P2, correct: false },
    ]);
  });

  it('keeps the check behind the verdict, prompt by prompt', () => {
    const words = [
      { text: 'bussen', startMs: 500, endMs: 900, confidence: 0.9 },
      { text: 'går', startMs: 900, endMs: 1100, confidence: null },
      { text: 'minutter', startMs: 6200, endMs: 6500, confidence: 0.8 },
    ];
    const pronunciation = { accuracy: 80, fluency: 70, completeness: 90, prosody: null, words: [] };
    const result = readingRuling(input(), [
      hearing(P1, lexical(TEXT1)),
      hearing(P2, P2_TWO_MISSED, { words, pronunciation }),
    ]);
    if ('missing' in result) throw new Error('expected a ruling');

    expect(result.reading.passPercent).toBe(85);
    expect(result.reading.carriedItemIds).toEqual([]);
    const second = result.reading.prompts[1]!;
    expect(second).toMatchObject({
      itemId: P2,
      transcript: P2_TWO_MISSED,
      words,
      pronunciation,
      audioMs: 20000,
      percent: 86,
      passed: true,
      // Three words over six seconds.
      wordsPerMinute: 30,
    });
    expect(second.check).toMatchObject({ total: 15, read: 13, missed: 2 });
    expect(second.check.ops.filter((op) => op.k === 'missed')).toEqual([
      { k: 'missed', i: 2, expected: 'hvert', focus: true },
      { k: 'missed', i: 13, expected: 'tjue', focus: true },
    ]);
    expect(result.reading.prompts[0]!.wordsPerMinute).toBeNull();
  });

  it('rules from the words alone: pronunciation scores, however low or high, change nothing (§2.3)', () => {
    const poor = { accuracy: 5, fluency: 3, completeness: 10, prosody: null, words: [{ text: 'bussen', accuracy: 0, error: 'mispronunciation' as const }] };
    const perfect = { accuracy: 100, fluency: 100, completeness: 100, prosody: 100, words: [] };
    const rule = (p1: typeof poor | typeof perfect | null, p2: typeof poor | typeof perfect | null) => {
      const result = readingRuling(input({ passPercent: 90 }), [
        hearing(P1, lexical(TEXT1), { pronunciation: p1 }),
        hearing(P2, P2_TWO_MISSED, { pronunciation: p2 }),
      ]);
      if ('missing' in result) throw new Error('expected a ruling');
      return result.ruling;
    };

    const plain = rule(null, null);
    expect(rule(poor, perfect)).toEqual(plain);
    expect(rule(perfect, poor)).toEqual(plain);
  });

  it('names the prompts nothing was heard for, and rules on none of them', () => {
    expect(readingRuling(input(), [hearing(P1, lexical(TEXT1))])).toEqual({ missing: [P2] });
  });

  it('reads silence as a prompt not read', () => {
    const result = readingRuling(input(), [hearing(P1, lexical(TEXT1)), hearing(P2, '')]);
    if ('missing' in result) throw new Error('expected a ruling');
    expect(result.ruling.decisions[1]).toEqual({ itemId: P2, approved: false, comment: '0/15 · 0 % < 85 %' });
    expect(result.ruling.score).toBe(50);
  });

  it('leaves a carried prompt as it was passed and checks only the new one', () => {
    const carried = { attemptId: 'a-prev', attempt: 1, marks: { pron: 3, flow: 2 }, points: 13, max: 15, comment: 'Bra flyt.' };
    const recordings: SubmittedRecording[] = [
      { itemId: P1, assetId: 'a1', seconds: 22, takes: 1, carried },
      { itemId: P2, assetId: 'b2', seconds: 14, takes: 1 },
    ];
    const result = readingRuling(
      input({ passages: [{ itemId: P2, text: TEXT2, focus: [] }], recordings }),
      [hearing(P2, P2_TWO_MISSED)],
    );
    if ('missing' in result) throw new Error('expected a ruling');

    expect(result.ruling).toMatchObject({
      outcome: 'approved',
      // The carried prompt has no accuracy to add.
      score: 86,
      approvedItems: 2,
      totalItems: 2,
      rubricMarks: { [`${P1}:pron`]: 3, [`${P1}:flow`]: 2 },
      gapResults: [{ gapKey: P2, correct: true }],
    });
    expect(result.ruling.decisions[0]).toEqual({ itemId: P1, approved: true, comment: 'Bra flyt.' });
    expect(result.reading.carriedItemIds).toEqual([P1]);
    expect(result.reading.prompts.map((p) => p.itemId)).toEqual([P2]);
  });

  it('leaves out a recording whose prompt the exercise no longer holds', () => {
    const result = readingRuling(input({ passages: [{ itemId: P1, text: TEXT1, focus: [] }] }), [
      hearing(P1, lexical(TEXT1)),
    ]);
    if ('missing' in result) throw new Error('expected a ruling');
    expect(result.ruling.decisions.map((d) => d.itemId)).toEqual([P1]);
    expect(result.ruling).toMatchObject({ outcome: 'approved', totalItems: 1 });
  });
});

describe('readingComment', () => {
  it('rounds the share down, so a prompt just short never reads as the mark', () => {
    // 84.6 %.
    expect(readingComment({ read: 11, total: 13 }, 85)).toBe('11/13 · 84 % < 85 %');
    expect(readingComment({ read: 17, total: 20 }, 85)).toBe('17/20 · 85 % ≥ 85 %');
  });

  // Plan 82, step 8: every prompt is its own ai-service call.
  it('keeps the call that heard each prompt, and leaves it out of what people are shown', () => {
    const result = readingRuling(input(), [
      hearing(P1, lexical(TEXT1), { aiCallId: 'call-1' }),
      hearing(P2, lexical(TEXT2), { aiCallId: 'call-2' }),
    ]);
    if ('missing' in result) throw new Error('expected a ruling');
    expect(result.reading.prompts.map((p) => p.aiCallId)).toEqual(['call-1', 'call-2']);

    const viewed = readingForView(result.reading)!;
    expect(viewed.prompts.map((p) => 'aiCallId' in p)).toEqual([false, false]);
    expect(viewed.prompts.map((p) => p.passed)).toEqual(result.reading.prompts.map((p) => p.passed));
    expect(readingForView(null)).toBeNull();
  });
});

describe('checkReadings', () => {
  it('counts each prompt as the ruling would, and rules on none (step 10)', () => {
    const passages = [
      { itemId: P1, text: TEXT1, transcript: lexical(TEXT1) },
      { itemId: P2, text: TEXT2, transcript: P2_TWO_MISSED },
    ];
    expect(checkReadings('nb', 90, passages)).toEqual([
      { itemId: P1, read: 23, total: 23, percent: 100, passed: true },
      { itemId: P2, read: 13, total: 15, percent: 86, passed: false },
    ]);

    // The same transcripts ruled on: the same pass and fail, prompt by prompt.
    const ruled = readingRuling(input({ passPercent: 90 }), [hearing(P1, lexical(TEXT1)), hearing(P2, P2_TWO_MISSED)]);
    if ('missing' in ruled) throw new Error('expected a ruling');
    expect(ruled.reading.prompts.map((p) => p.passed)).toEqual([true, false]);
  });

  it('reads silence as nothing read', () => {
    expect(checkReadings('nb', 85, [{ itemId: P2, text: TEXT2, transcript: '' }])).toEqual([
      { itemId: P2, read: 0, total: 15, percent: 0, passed: false },
    ]);
  });
});
