import {
  accuracyPercent,
  checkReading,
  marksWithCarried,
  readingPasses,
  readingVerdict,
  wordsPerMinute,
  type ReadingCheck,
  type SubmittedRecording,
} from '@ssz/shared-kernel/read-aloud';
import type { ReviewDecision, ReviewVerdict } from '../../attempts/domain/entities/attempt.entity.js';

/** One word the recognizer heard, where in the recording (ai-service `HeardWord`). */
export interface HeardWord {
  text: string;
  startMs: number;
  endMs: number;
  /** 0–1; null when the provider does not say. */
  confidence: number | null;
}

/** How a passage word was pronounced, by the provider's own alignment (Azure PA). */
export interface PronouncedWord {
  text: string;
  /** 0–100. */
  accuracy: number;
  error: 'none' | 'mispronunciation' | 'omission' | 'insertion';
}

/** Pronunciation scores, 0–100 — feedback only, never part of the verdict (plan 82 §2.3). */
export interface PronunciationScores {
  accuracy: number;
  fluency: number;
  completeness: number;
  /** Null where the locale has none. */
  prosody: number | null;
  words: PronouncedWord[];
}

/** What the recognizer heard in one prompt's recording — ai-service's half of the write. */
export interface PromptHearing {
  itemId: string;
  /** The words heard as one string, in the provider's lexical form — what the check reads. */
  transcript: string;
  words: HeardWord[];
  /** Length of the audio the provider took; null when it did not say. */
  audioMs: number | null;
  pronunciation: PronunciationScores | null;
  /**
   * The ai-service ledger row of the call that heard this prompt — each prompt is its own call,
   * and a fallback or a dropped pronunciation level may answer one prompt and not the next.
   * The draft's `aiCallId` is the first prompt's. Internal: never shown to a learner or a
   * teacher. Null when ai-service did not say.
   */
  aiCallId: string | null;
}

/**
 * One prompt as the review keeps it: what was heard and the check the verdict stood on,
 * frozen — the passage may be edited later, and the learner is shown what was ruled.
 */
export interface PromptReadingReview extends PromptHearing {
  check: ReadingCheck;
  /** Whole percent, rounded down (`accuracyPercent`). */
  percent: number;
  passed: boolean;
  /**
   * Over the speech heard — fluency feedback, never the verdict. Null when the author did not
   * ask for it (`review.ai.fluency` at the time of the ruling) or nothing was heard.
   */
  wordsPerMinute: number | null;
}

/** The machine's reading of a `read_aloud` submission, kept on its `voice_review` review. */
export interface DraftReading {
  passPercent: number;
  /** In the exercise's order. */
  prompts: PromptReadingReview[];
  /** Carried from a returned try (plan 70, phase 11b): ruled then, not checked here. */
  carriedItemIds: string[];
}

/** A passage the machine checks, as the review subject gives it (plan 82, step 6). */
export interface ReadingPassage {
  itemId: string;
  text: string;
  focus: string[];
}

export interface ReadingRulingInput {
  /** The course language — picks the number words of the check. */
  language: string;
  passPercent: number;
  /** The author asks for the pace to be reported (`review.ai.fluency`) — frozen as the mark is. */
  fluency: boolean;
  /** The prompts recorded in this try, in the exercise's order. */
  passages: ReadingPassage[];
  /** The whole submission, carried prompts included. */
  recordings: readonly SubmittedRecording[];
}

export type ReadingRuling =
  | { ruling: Omit<ReviewVerdict, 'aiDraft'>; reading: DraftReading }
  /** Passages nothing was heard for — never read as either verdict. */
  | { missing: string[] };

/**
 * The verdict on a `read_aloud` reading, computed here from what the recognizer heard
 * (plan 82, step 7). The machine's check decides, by the spirit of Q4-C of plan 79: the
 * recognizer only reports words, and nothing it says is taken as a ruling.
 *
 * What a teacher's verdict does a prompt at a time (`reviewByPrompt`), with the check in
 * place of the rubric:
 *
 * - **A prompt passes** when its share of passage words read reaches the author's mark
 *   (`readingPasses`, Q4); the work is approved when every prompt passes, returned otherwise.
 * - **Its score** is the mean accuracy over the prompts checked (Q4) — the carried ones have
 *   no accuracy to add; `approvedItems` / `totalItems` count prompts.
 * - **Every prompt carries a word**, as the queue requires of a teacher: the check's count
 *   against the mark, in figures, so it reads the same in any language (`readingComment`).
 * - **Each checked prompt reaches the memory** (`gapResults`), one step weaker as any `read`
 *   (Q6-A of plan 70) — the machine checks nothing else.
 * - **A carried prompt** keeps its ruling and its marks, counts towards the verdict, and is
 *   not reported to the memory again — the same as under a teacher.
 *
 * A recording whose prompt the exercise no longer holds has no passage and is left out, as
 * the review subject leaves it out.
 */
export function readingRuling(input: ReadingRulingInput, heard: readonly PromptHearing[]): ReadingRuling {
  const byId = new Map(heard.map((h) => [h.itemId, h]));
  const missing = input.passages.filter((p) => !byId.has(p.itemId)).map((p) => p.itemId);
  if (missing.length > 0) return { missing };

  const checks = input.passages.map((passage) => {
    const hearing = byId.get(passage.itemId)!;
    return {
      hearing,
      check: checkReading(
        passage.text,
        hearing.transcript,
        input.language,
        passage.focus.map((word) => ({ word })),
      ),
    };
  });
  const verdict = readingVerdict(
    checks.map(({ hearing, check }) => ({ itemId: hearing.itemId, check })),
    input.passPercent,
  );
  const prompts: PromptReadingReview[] = checks.map(({ hearing, check }, index) => ({
    itemId: hearing.itemId,
    transcript: hearing.transcript,
    words: hearing.words,
    audioMs: hearing.audioMs,
    pronunciation: hearing.pronunciation,
    aiCallId: hearing.aiCallId,
    check,
    percent: verdict.prompts[index]!.percent,
    passed: verdict.prompts[index]!.passed,
    wordsPerMinute: input.fluency ? wordsPerMinute(hearing.words.length, speechSeconds(hearing.words)) : null,
  }));

  const checked = new Map(prompts.map((p) => [p.itemId, p]));
  const carried = input.recordings.filter((r) => r.carried);
  const decisions: ReviewDecision[] = input.recordings.flatMap((r): ReviewDecision[] => {
    if (r.carried) return [{ itemId: r.itemId, approved: true, comment: r.carried.comment }];
    const prompt = checked.get(r.itemId);
    if (prompt === undefined) return [];
    return [{ itemId: r.itemId, approved: prompt.passed, comment: readingComment(prompt.check, input.passPercent) }];
  });
  const passed = verdict.passed && decisions.every((d) => d.approved);
  const marks = marksWithCarried({}, carried);

  return {
    ruling: {
      outcome: passed ? 'approved' : 'returned',
      decisions,
      comment: null,
      score: verdict.score,
      passed,
      approvedItems: decisions.filter((d) => d.approved).length,
      totalItems: decisions.length,
      ...(Object.keys(marks).length === 0 ? {} : { rubricMarks: marks }),
      gapResults: prompts.map((p) => ({ gapKey: p.itemId, correct: p.passed })),
      evidenceLowered: true,
    },
    reading: {
      passPercent: input.passPercent,
      prompts,
      carriedItemIds: carried.map((r) => r.itemId),
    },
  };
}

/**
 * The machine's word on a prompt: words read of the passage, the share, and the mark it is
 * measured against — `12/15 · 80 % < 85 %`. Figures only, so the teacher's card and the
 * learner's read it in any interface language; the panel for reading aloud (step 11) draws
 * the words themselves from the review's `reading`.
 */
export function readingComment(check: Pick<ReadingCheck, 'read' | 'total'>, passPercent: number): string {
  const sign = readingPasses(check, passPercent) ? '≥' : '<';
  return `${check.read}/${check.total} · ${accuracyPercent(check)} % ${sign} ${passPercent} %`;
}

/** A passage beside what was heard in its take, to be checked and not ruled on. */
export interface ReadingToCheck {
  itemId: string;
  text: string;
  transcript: string;
}

/** The check's counts on one prompt — what a verdict would stand on, without the verdict. */
export interface PromptCheckCount {
  itemId: string;
  read: number;
  total: number;
  /** Whole percent, rounded down (`accuracyPercent`). */
  percent: number;
  passed: boolean;
}

/**
 * The same check `readingRuling` rules by, prompt by prompt, with nothing written and nothing
 * ruled — for a speech model run in the shadow over teachers' verdicts (plan 82, step 10), so
 * the machine's pass and fail there are exactly what it would give a learner.
 */
export function checkReadings(
  language: string,
  passPercent: number,
  readings: readonly ReadingToCheck[],
): PromptCheckCount[] {
  return readings.map(({ itemId, text, transcript }) => {
    const check = checkReading(text, transcript, language, []);
    return {
      itemId,
      read: check.read,
      total: check.total,
      percent: accuracyPercent(check),
      passed: readingPasses(check, passPercent),
    };
  });
}

/** From the first word heard to the end of the last; 0 when nothing was heard. */
function speechSeconds(words: readonly HeardWord[]): number {
  if (words.length === 0) return 0;
  return Math.max(0, words[words.length - 1]!.endMs - words[0]!.startMs) / 1000;
}

/** A reading as a learner or a teacher sees it: without the ledger ids of the calls behind it. */
export interface ViewedReading extends Omit<DraftReading, 'prompts'> {
  prompts: Array<Omit<PromptReadingReview, 'aiCallId'>>;
}

export function readingForView(reading: DraftReading | null): ViewedReading | null {
  if (reading === null) return null;
  return { ...reading, prompts: reading.prompts.map(({ aiCallId: _aiCallId, ...prompt }) => prompt) };
}
