/**
 * How long a teacher takes over one submission of a template — the figure a review
 * forecast multiplies the queue by (plan 81, Q3).
 *
 * The school's own history when it has enough of it: the median of
 * `review_handling_seconds` over the last {@link REVIEW_EFFORT_HISTORY_DAYS} days, once
 * at least {@link REVIEW_EFFORT_MIN_SAMPLE} verdicts back it. Until then a constant from
 * {@link DEFAULT_REVIEW_MINUTES} — a guess, and the answer says which of the two it is.
 */

/** How far back a school's handling times are read. */
export const REVIEW_EFFORT_HISTORY_DAYS = 90;

/** The fewest timed verdicts a school's median is trusted on; below it the constant wins. */
export const REVIEW_EFFORT_MIN_SAMPLE = 20;

/**
 * Minutes per submission before a school has history of its own.
 *
 * Starting guesses, not measurements: an essay is read and commented on, a recording is
 * listened to through, a sentence is checked against its key. Each school replaces them
 * with its own median as soon as the sample allows.
 */
export const DEFAULT_REVIEW_MINUTES: Readonly<Record<string, number>> = {
  writing_task: 12,
  read_aloud: 5,
  information_transfer: 4,
  translate_to_target: 4,
  translate_from_target: 4,
  error_correction: 3,
  short_answer: 2,
};

/** A template that reaches a teacher but has no entry above. */
export const FALLBACK_REVIEW_MINUTES = 3;

/** What the school's history says about one template, as the database counted it. */
export interface HandlingTimeStat {
  templateCode: string;
  sampleSize: number;
  medianSeconds: number;
}

export type ReviewEffortNormSource = 'history' | 'default';

export interface ReviewEffortNorm {
  templateCode: string;
  minutesPerSubmission: number;
  source: ReviewEffortNormSource;
  /** Timed verdicts the school has on this template in the window — also when too few. */
  sampleSize: number;
}

/**
 * One norm per template named in `templateCodes` or present in `stats`, in code order.
 *
 * Every template the queue holds gets a norm, so the caller never needs a fallback of its
 * own; one with history but nothing waiting is still reported, since a screen showing the
 * school's measured times has a use for it.
 */
export function resolveReviewEffortNorms(
  templateCodes: Iterable<string>,
  stats: readonly HandlingTimeStat[],
): ReviewEffortNorm[] {
  const byTemplate = new Map(stats.map((stat) => [stat.templateCode, stat]));
  const codes = new Set([...templateCodes, ...byTemplate.keys()]);

  return [...codes].sort().map((templateCode) => {
    const stat = byTemplate.get(templateCode);
    const sampleSize = stat?.sampleSize ?? 0;

    if (stat && sampleSize >= REVIEW_EFFORT_MIN_SAMPLE) {
      return {
        templateCode,
        // One decimal: the forecast is read in hours, and a tenth of a minute is already
        // finer than anybody's marking pace.
        minutesPerSubmission: Math.round(stat.medianSeconds / 6) / 10,
        source: 'history',
        sampleSize,
      };
    }

    return {
      templateCode,
      minutesPerSubmission: DEFAULT_REVIEW_MINUTES[templateCode] ?? FALLBACK_REVIEW_MINUTES,
      source: 'default',
      sampleSize,
    };
  });
}
