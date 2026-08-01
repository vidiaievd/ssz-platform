import { ErrorCorrectionValidator } from '../../../../src/infrastructure/validation/validators/error-correction.validator.js';

const validator = new ErrorCorrectionValidator();

type Correction = { item_id: string; chunk_id: string; accepted: string[]; note?: string };

const expected: Correction[] = [
  { item_id: '1', chunk_id: 'c5', accepted: ['she was warming to me'], note: 'warm to sb' },
  { item_id: '2', chunk_id: 'c3', accepted: ['make up your mind'] },
  { item_id: '3', chunk_id: 'c4', accepted: ['show off'] },
];

const run = (corrections: Correction[], settings: Record<string, unknown> = {}) =>
  validator.validate({
    submittedAnswer: { corrections },
    expectedAnswers: { corrections: expected },
    checkSettings: settings,
    targetLanguage: 'en',
  });

const fix = (itemId: string, chunkId: string, text: string): Correction => ({
  item_id: itemId,
  chunk_id: chunkId,
  accepted: [text],
});

const outcomes = (result: ReturnType<typeof run>) =>
  (result.value.details as { corrections: Array<{ chunk_id: string; outcome: string }> }).corrections;

describe('ErrorCorrectionValidator', () => {
  it('scores 100 when every mistake is found and rewritten', () => {
    const result = run([
      fix('1', 'c5', 'she was warming to me'),
      fix('2', 'c3', 'make up your mind'),
      fix('3', 'c4', 'show off'),
    ]);

    expect(result.isOk).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
    expect(result.value.requiresReview).toBe(false);
  });

  it('separates a missed mistake from a wrong rewrite', () => {
    const result = run([fix('1', 'c5', 'she was warming with me')]);
    const byChunk = new Map(outcomes(result).map((c) => [c.chunk_id, c.outcome]));

    expect(byChunk.get('c5')).toBe('wrong_fix');
    expect(byChunk.get('c3')).toBe('missed');
    expect(result.value.score).toBe(0);
  });

  it('gives partial credit per mistake fixed', () => {
    const result = run([fix('1', 'c5', 'she was warming to me'), fix('2', 'c3', 'make up your mind')]);

    expect(result.value.score).toBe(67);
    expect(result.value.correct).toBe(false);
  });

  describe('false positives', () => {
    it('costs a point for rewriting a sound chunk', () => {
      const result = run([
        fix('1', 'c5', 'she was warming to me'),
        fix('2', 'c3', 'make up your mind'),
        fix('1', 'c1', 'I saw'), // untouched by the answer key
      ]);

      // 2 fixed − 1 false positive = 1 of 3.
      expect(result.value.score).toBe(33);
      expect(outcomes(result).find((c) => c.chunk_id === 'c1')!.outcome).toBe('false_positive');
    });

    it('never drops below zero', () => {
      const result = run([fix('1', 'c1', 'a'), fix('1', 'c2', 'b'), fix('2', 'c9', 'c')]);
      expect(result.value.score).toBe(0);
    });

    it('is not scored when penalize_false_positives is off', () => {
      const result = run(
        [
          fix('1', 'c5', 'she was warming to me'),
          fix('2', 'c3', 'make up your mind'),
          fix('1', 'c1', 'I saw'),
        ],
        { penalize_false_positives: false },
      );

      expect(result.value.score).toBe(67);
    });

    it('blocks a full pass even when every mistake was fixed', () => {
      const result = run([
        fix('1', 'c5', 'she was warming to me'),
        fix('2', 'c3', 'make up your mind'),
        fix('3', 'c4', 'show off'),
        fix('1', 'c1', 'I saw'),
      ]);

      expect(result.value.correct).toBe(false);
    });
  });

  it('ignores an edit the learner cleared back to empty', () => {
    const result = run([fix('1', 'c5', 'she was warming to me'), fix('1', 'c1', '   ')]);
    const byChunk = new Map(outcomes(result).map((c) => [c.chunk_id, c.outcome]));

    expect(byChunk.has('c1')).toBe(false);
    expect(result.value.score).toBe(33);
  });

  it('is case-insensitive and collapses whitespace by default', () => {
    const result = run([fix('1', 'c5', '  She Was   Warming to me ')]);
    expect(outcomes(result).find((c) => c.chunk_id === 'c5')!.outcome).toBe('fixed');
  });

  it('respects case_sensitive: true', () => {
    const result = run([fix('1', 'c5', 'She was warming to me')], { case_sensitive: true });
    expect(outcomes(result).find((c) => c.chunk_id === 'c5')!.outcome).toBe('wrong_fix');
  });

  it('is all-or-nothing when allow_partial_credit is false', () => {
    const result = run([fix('1', 'c5', 'she was warming to me')], { allow_partial_credit: false });
    expect(result.value.score).toBe(0);
  });

  it('carries the author note through for feedback', () => {
    const result = run([fix('1', 'c5', 'wrong')]);
    const entry = (result.value.details as { corrections: Array<{ chunk_id: string; note?: string }> })
      .corrections.find((c) => c.chunk_id === 'c5')!;

    expect(entry.note).toBe('warm to sb');
  });
});
