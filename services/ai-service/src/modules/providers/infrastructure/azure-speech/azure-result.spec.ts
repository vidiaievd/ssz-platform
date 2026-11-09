import { fromCancellation, segmentOf } from './azure-continuous.recognizer.js';
import { mergeSegments, type AzureSegment, type AzureWord } from './azure-result.js';

const word = (Word: string, accuracy: number, ErrorType = 'None', offsetMs = 0): AzureWord => ({
  Word,
  Offset: offsetMs * 10_000,
  Duration: 2_000_000,
  PronunciationAssessment: { AccuracyScore: accuracy, ErrorType },
});

const segment = (words: AzureWord[], durationMs: number, fluency?: number, prosody?: number): AzureSegment => ({
  durationMs,
  best: {
    Lexical: words.map((w) => w.Word).join(' '),
    PronunciationAssessment: { FluencyScore: fluency, ProsodyScore: prosody },
    Words: words,
  },
});

describe('mergeSegments', () => {
  it('puts the phrases together in order and scores them against the whole passage', () => {
    const result = mergeSegments(
      [
        segment([word('Jeg', 90, 'None', 100), word('bor', 70, 'Mispronunciation', 400)], 30_000, 80),
        segment([word('i', 100, 'None', 31_000), word('Bergen', 100, 'None', 31_200)], 10_000, 100),
      ],
      'Jeg bor i Bergen.',
    );

    expect(result.transcript).toBe('jeg bor i bergen');
    expect(result.words.map((w) => w.startMs)).toEqual([100, 400, 31_000, 31_200]);
    expect(result.pronunciation).toEqual({
      accuracy: 90,
      // Weighted by length: (80 · 30 + 100 · 10) / 40.
      fluency: 85,
      completeness: 100,
      prosody: null,
      words: [
        { text: 'jeg', accuracy: 90, error: 'none', phonemes: [] },
        { text: 'bor', accuracy: 70, error: 'mispronunciation', phonemes: [] },
        { text: 'i', accuracy: 100, error: 'none', phonemes: [] },
        { text: 'bergen', accuracy: 100, error: 'none', phonemes: [] },
      ],
    });
  });

  it('finds omissions and insertions itself — miscue is off per phrase', () => {
    const result = mergeSegments(
      [segment([word('jeg', 100), word('jeg', 90), word('bor', 80), word('Bergen', 60)], 5_000, 70)],
      'Jeg bor i Bergen',
    );

    expect(result.pronunciation?.words).toEqual([
      { text: 'jeg', accuracy: 100, error: 'none', phonemes: [] },
      { text: 'jeg', accuracy: 90, error: 'insertion', phonemes: [] },
      { text: 'bor', accuracy: 80, error: 'none', phonemes: [] },
      { text: 'i', accuracy: 0, error: 'omission', phonemes: [] },
      { text: 'bergen', accuracy: 60, error: 'none', phonemes: [] },
    ]);
    // Omission counts as 0, the insertion not at all: (100 + 80 + 0 + 60) / 4.
    expect(result.pronunciation).toMatchObject({ accuracy: 60, completeness: 75 });
    // The repeat was heard, the omitted word was not.
    expect(result.transcript).toBe('jeg jeg bor bergen');
  });

  it('reads a misread word as an insertion beside an omission', () => {
    const result = mergeSegments([segment([word('kunne', 40), word('service', 90)], 2_000)], 'kunde service');
    expect(result.pronunciation?.words.map((w) => [w.text, w.error])).toEqual([
      ['kunne', 'insertion'],
      ['kunde', 'omission'],
      ['service', 'none'],
    ]);
    // No phrase had a fluency score.
    expect(result.pronunciation?.fluency).toBe(0);
  });

  it('keeps each word its sounds, timed from the start of the recording — an omission has none', () => {
    const sound = (offsetMs: number, accuracy: number) => ({
      Phoneme: '',
      Offset: offsetMs * 10_000,
      Duration: 500_000,
      PronunciationAssessment: { AccuracyScore: accuracy },
    });
    const bor = { ...word('bor', 70, 'None', 31_000), Phonemes: [sound(31_000, 90), sound(31_050, 40), sound(31_100, 80)] };
    const extra = { ...word('og', 60, 'None', 31_300), Phonemes: [sound(31_300, 60), sound(31_350, 55)] };
    const result = mergeSegments([segment([bor, extra], 2_000)], 'bor i');

    expect(result.pronunciation?.words).toEqual([
      {
        text: 'bor',
        accuracy: 70,
        error: 'none',
        phonemes: [
          { startMs: 31_000, durationMs: 50, accuracy: 90 },
          { startMs: 31_050, durationMs: 50, accuracy: 40 },
          { startMs: 31_100, durationMs: 50, accuracy: 80 },
        ],
      },
      expect.objectContaining({ text: 'og', error: 'insertion', phonemes: [expect.anything(), expect.anything()] }),
      { text: 'i', accuracy: 0, error: 'omission', phonemes: [] },
    ]);
  });

  it('weights prosody too, and keeps it null when no phrase has it', () => {
    const result = mergeSegments([segment([word('a', 100)], 1_000, 90, 60), segment([word('b', 100)], 3_000, 90, 80)], 'a b');
    expect(result.pronunciation?.prosody).toBe(75);
  });

  it('without a passage gives the words only', () => {
    const result = mergeSegments([segment([word('Jeg', 0)], 1_000)], null);
    expect(result).toEqual({ transcript: 'jeg', words: [{ text: 'jeg', startMs: 0, endMs: 200, confidence: null }], pronunciation: null });
  });

  it('falls back on the lexical text when phrases carry no words, and hears nothing in no phrases', () => {
    expect(mergeSegments([{ durationMs: 1_000, best: { Lexical: 'Jeg heter' } }], null).transcript).toBe('jeg heter');
    expect(mergeSegments([], 'Jeg heter')).toMatchObject({
      transcript: '',
      words: [],
      pronunciation: { accuracy: 0, completeness: 0, fluency: 0 },
    });
  });
});

describe('segmentOf', () => {
  it('reads a phrase and its length, and skips what is not one', () => {
    expect(segmentOf(JSON.stringify({ RecognitionStatus: 'Success', Duration: 25_000_000, NBest: [{ Lexical: 'jeg' }] }))).toEqual({
      durationMs: 2_500,
      best: { Lexical: 'jeg' },
    });
    expect(segmentOf(JSON.stringify({ RecognitionStatus: 'NoMatch' }))).toBeNull();
    expect(segmentOf('not json')).toBeNull();
  });
});

describe('fromCancellation', () => {
  it.each([
    ['AuthenticationFailure', 'auth', false],
    ['Forbidden', 'auth', false],
    ['BadRequestParameters', 'invalid_request', false],
    ['TooManyRequests', 'rate_limited', true],
    ['ServiceTimeout', 'timeout', true],
    ['ConnectionFailure', 'unavailable', true],
    ['ServiceError', 'unavailable', true],
    ['RuntimeError', 'unknown', false],
  ])('maps %s to %s', (code, expected, retryable) => {
    const err = fromCancellation(code, 'details');
    expect(err.code).toBe(expected);
    expect(err.retryable).toBe(retryable);
  });

  it('reads the refused handshake’s status: a bad key is not an outage', () => {
    const refused = (status: number) => `Unable to contact server. StatusCode: 1006, undefined Reason:  Unexpected server response: ${status}`;
    expect(fromCancellation('ConnectionFailure', refused(401)).code).toBe('auth');
    expect(fromCancellation('ConnectionFailure', refused(403)).code).toBe('auth');
    expect(fromCancellation('ConnectionFailure', refused(429)).code).toBe('rate_limited');
    expect(fromCancellation('ConnectionFailure', refused(502)).code).toBe('unavailable');
  });
});
