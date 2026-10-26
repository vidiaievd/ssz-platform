import { lexicalWord, lexicalWords } from '../../domain/lexical.js';
import type { HeardWord, PronouncedWord, PronunciationScores } from '../../domain/speech-result.js';

/**
 * Azure's recognition JSON, as both the REST endpoint and the Speech SDK give it (plan 82,
 * step 9). Scores sit on the word / best result itself in the REST answer, and under
 * `PronunciationAssessment` in the SDK's JSON; both are read.
 */
export interface AzureScored {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  ProsodyScore?: number;
  ErrorType?: string;
  PronunciationAssessment?: Omit<AzureScored, 'PronunciationAssessment'>;
}

export interface AzureWord extends AzureScored {
  Word: string;
  Offset?: number | string;
  Duration?: number | string;
  Confidence?: number | string;
}

export interface AzureBest extends AzureScored {
  Lexical?: string;
  Words?: AzureWord[];
}

export interface AzureRecognition {
  RecognitionStatus: string;
  Offset?: number | string;
  Duration?: number | string;
  NBest?: AzureBest[];
}

/** One recognized phrase of a continuous recognition, with how long it lasted. */
export interface AzureSegment {
  best: AzureBest;
  durationMs: number;
}

/** What the words of one or more results come to. */
export interface AzureHearing {
  transcript: string;
  words: HeardWord[];
  pronunciation: PronunciationScores | null;
}

/** Statuses that mean "nothing was said", not a failure. */
export const NOTHING_HEARD: ReadonlySet<string> = new Set(['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout']);

/** Offsets and durations come in 100-nanosecond ticks. */
const TICKS_PER_MS = 10_000;

/**
 * One result assessed with miscue on (the REST call): Azure has aligned the words with the
 * passage itself, so the words heard are its words minus omissions.
 */
export function hearingOf(best: AzureBest, assess: boolean): AzureHearing {
  const aligned = best.Words ?? [];
  const words = heardWords(aligned);
  // Built from the words rather than `Lexical`: with miscue, the aligned words are the miscue
  // view of what was read, and a word Azure calls omitted must not reappear here.
  const transcript = aligned.length > 0 ? words.map((w) => w.text).join(' ') : lexicalText(best.Lexical);
  return { transcript, words, pronunciation: assess ? scoresOf(best, aligned) : null };
}

/**
 * The phrases of a continuous recognition (the Speech SDK, recordings over 30 s) as one hearing.
 * Miscue is off there — each phrase is scored on its own — so the omissions and insertions
 * against the passage are found here, by aligning the words heard with the passage's words,
 * and the overall scores are rebuilt the way Microsoft's continuous sample does: accuracy is
 * the mean over the passage's words (an omission scores 0, an insertion does not count),
 * completeness the share of passage words heard, fluency and prosody the phrases' scores
 * weighted by their length.
 *
 * `referenceText` null = no assessment asked: the words only.
 */
export function mergeSegments(segments: AzureSegment[], referenceText: string | null): AzureHearing {
  const recognized = segments.flatMap((s) => s.best.Words ?? []).filter((w) => lexicalWord(w.Word));
  const words = heardWords(recognized);
  const transcript = recognized.length > 0
    ? words.map((w) => w.text).join(' ')
    : segments.map((s) => lexicalText(s.best.Lexical)).filter((t) => t).join(' ');
  if (referenceText === null) return { transcript, words, pronunciation: null };

  const passage = lexicalWords(referenceText);
  const pronounced = alignWithPassage(passage, recognized);
  const counted = pronounced.filter((w) => w.error !== 'insertion');
  const matched = counted.filter((w) => w.error !== 'omission').length;

  return {
    transcript,
    words,
    pronunciation: {
      accuracy: round1(counted.length > 0 ? counted.reduce((sum, w) => sum + w.accuracy, 0) / counted.length : 0),
      fluency: weighted(segments, 'FluencyScore') ?? 0,
      completeness: round1(passage.length > 0 ? (matched / passage.length) * 100 : 0),
      prosody: weighted(segments, 'ProsodyScore'),
      words: pronounced,
    },
  };
}

/**
 * The passage's words against the words heard, by the longest common subsequence: a passage
 * word not heard is an omission, a heard word not in the passage an insertion. A misread word
 * comes out as both — the reading check in the engine, not this, is what rules on it.
 */
function alignWithPassage(passage: string[], recognized: AzureWord[]): PronouncedWord[] {
  const heard = recognized.map((w) => lexicalWord(w.Word));
  const n = passage.length;
  const m = heard.length;
  // lcs[i][j] = common words of passage[i..] and heard[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = passage[i] === heard[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: PronouncedWord[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && passage[i] === heard[j]) {
      const error = errorOf(recognized[j]!) === 'mispronunciation' ? 'mispronunciation' : 'none';
      out.push({ text: heard[j]!, accuracy: score(recognized[j]!, 'AccuracyScore') ?? 0, error });
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      out.push({ text: heard[j]!, accuracy: score(recognized[j]!, 'AccuracyScore') ?? 0, error: 'insertion' });
      j++;
    } else {
      out.push({ text: passage[i]!, accuracy: 0, error: 'omission' });
      i++;
    }
  }
  return out;
}

function heardWords(aligned: AzureWord[]): HeardWord[] {
  return aligned.flatMap((w) => {
    const text = lexicalWord(w.Word);
    if (!text || errorOf(w) === 'omission') return [];
    const startMs = ticksToMs(w.Offset);
    return [{ text, startMs, endMs: startMs + ticksToMs(w.Duration), confidence: confidenceOf(w.Confidence) }];
  });
}

function scoresOf(best: AzureBest, aligned: AzureWord[]): PronunciationScores {
  const words: PronouncedWord[] = aligned.flatMap((w) => {
    const text = lexicalWord(w.Word);
    return text ? [{ text, accuracy: score(w, 'AccuracyScore') ?? 0, error: errorOf(w) }] : [];
  });
  return {
    accuracy: score(best, 'AccuracyScore') ?? 0,
    fluency: score(best, 'FluencyScore') ?? 0,
    completeness: score(best, 'CompletenessScore') ?? 0,
    // Prosody is scored for a few locales only (not `nb-NO`).
    prosody: score(best, 'ProsodyScore'),
    words,
  };
}

/** A phrase-level score over all phrases, weighted by length; null when no phrase has it. */
function weighted(segments: AzureSegment[], field: 'FluencyScore' | 'ProsodyScore'): number | null {
  let total = 0;
  let weight = 0;
  for (const s of segments) {
    const value = score(s.best, field);
    if (value === null) continue;
    const w = Math.max(s.durationMs, 1);
    total += value * w;
    weight += w;
  }
  return weight > 0 ? round1(total / weight) : null;
}

function score(scored: AzureScored, field: 'AccuracyScore' | 'FluencyScore' | 'CompletenessScore' | 'ProsodyScore'): number | null {
  const raw = scored.PronunciationAssessment?.[field] ?? scored[field];
  if (raw === undefined || raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

/** Azure's own error types; the prosody ones (breaks, monotone) are not reading errors. */
function errorOf(word: AzureScored): PronouncedWord['error'] {
  switch (word.PronunciationAssessment?.ErrorType ?? word.ErrorType) {
    case 'Mispronunciation':
      return 'mispronunciation';
    case 'Omission':
      return 'omission';
    case 'Insertion':
      return 'insertion';
    default:
      return 'none';
  }
}

export function ticksToMs(ticks: number | string | undefined): number {
  const value = Number(ticks);
  return Number.isFinite(value) && value > 0 ? Math.round(value / TICKS_PER_MS) : 0;
}

function confidenceOf(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

function lexicalText(text: string | undefined): string {
  return lexicalWords(text ?? '').join(' ');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
