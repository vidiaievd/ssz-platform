/**
 * How long a teacher takes over one submission of a template — the figure a review
 * forecast multiplies the queue by (plan 81, Q3 and Q5).
 *
 * The school's own history when it has enough of it: the median of
 * `review_handling_seconds` over the last {@link REVIEW_EFFORT_HISTORY_DAYS} days, once
 * at least {@link REVIEW_EFFORT_MIN_SAMPLE} verdicts back it. Until then the school's
 * starting minutes — its own setting, or organization-service's factory value where it set
 * none — and the answer says which of the three it is.
 */

/** How far back a school's handling times are read. */
export const REVIEW_EFFORT_HISTORY_DAYS = 90;

/** The fewest timed verdicts a school's median is trusted on; below it the starting minutes win. */
export const REVIEW_EFFORT_MIN_SAMPLE = 20;

/** What the school's history says about one template, as the database counted it. */
export interface HandlingTimeStat {
  templateCode: string;
  sampleSize: number;
  medianSeconds: number;
}

/** Whose a starting figure is, as organization-service reports it. */
export type StartingMinutesSource = 'school' | 'default';

/**
 * A school's minutes per submission before measurements (plan 81, step 5b). Factory values
 * are already filled in by organization-service, so the engine keeps no copy of them.
 */
export interface StartingReviewMinutes {
  templates: readonly { templateCode: string; minutes: number; source: StartingMinutesSource }[];
  /** For a template on neither list. */
  other: { minutes: number; source: StartingMinutesSource };
}

export type ReviewEffortNormSource = 'history' | StartingMinutesSource;

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
  starting: StartingReviewMinutes,
): ReviewEffortNorm[] {
  const byTemplate = new Map(stats.map((stat) => [stat.templateCode, stat]));
  const startingByTemplate = new Map(starting.templates.map((entry) => [entry.templateCode, entry]));
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

    const start = startingByTemplate.get(templateCode) ?? starting.other;
    return {
      templateCode,
      minutesPerSubmission: start.minutes,
      source: start.source,
      sampleSize,
    };
  });
}
