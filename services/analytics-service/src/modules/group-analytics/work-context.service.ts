import { Injectable } from '@nestjs/common';
import { distributionOf, pct } from '@ssz/shared-kernel/analytics';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { weighAttempt } from './group-units.service.js';

/** The buckets of DECISIONS §O2, always all four — `classwork` is empty and says so. */
export const WORK_CONTEXTS: Array<'homework' | 'self_study' | 'classwork' | null> = [
  'homework',
  'self_study',
  'classwork',
  null,
];

export interface WorkContextReading {
  buckets: WorkContextBucket[];
  /**
   * Attempts by these learners that name no course at all, and so could not be counted
   * into the buckets above.
   *
   * Almost all of them are older than `workContextSplitFrom`: the columns that say which
   * course and which setting an attempt belonged to were added on that date, and nothing
   * can be backfilled into them. Reported rather than dropped, because a learner with
   * eighty attempts and an empty bar would otherwise read as a learner who has done
   * nothing — the same false emptiness this plan is about, arriving from the data side.
   */
  unattributed: number;
}

export interface WorkContextBucket {
  key: 'homework' | 'self_study' | 'classwork' | null;
  attempts: number;
  /** Share of the attempts counted, 0..100. */
  share: number;
  /** Median learner pass rate, 0..100 — for one learner, simply their own. */
  median: number | null;
}

/**
 * Where the work happens — one reading, for a group or for a single learner.
 *
 * The group's chart and the learner's screen print the same bar, and a teacher moves
 * between them in one click; two counts of "how much of this was homework" would differ
 * on the first attempt either of them chose to ignore. Asked for one learner, the median
 * across learners is that learner's own rate, which is why one function serves both.
 *
 * `classwork` is present and empty on purpose: nothing sets it until the lesson-aware
 * attempt of plans 59/60 lands, and an absent bucket would read as "we never work in
 * class" rather than as "this is not recorded yet".
 */
@Injectable()
export class WorkContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scoped by learner and course, never by the attempt's `groupId`: work done alone
   * carries no group, and filtering on one would leave `self_study` permanently empty —
   * the exact false zero this plan is about.
   */
  async of(userIds: readonly string[], courseId: string | null): Promise<WorkContextReading> {
    const empty = {
      buckets: WORK_CONTEXTS.map((key) => ({ key, attempts: 0, share: 0, median: null })),
      unattributed: 0,
    };
    if (userIds.length === 0 || courseId === null) return empty;

    const [rows, unattributed] = await Promise.all([
      this.prisma.attemptEvidence.findMany({
        where: { userId: { in: [...userIds] }, containerId: courseId },
        select: {
          userId: true,
          workContext: true,
          passed: true,
          ratingApplied: true,
          answerMode: true,
          bankSize: true,
          wordsConsumed: true,
          templateCode: true,
          gapPosition: true,
        },
      }),
      this.prisma.attemptEvidence.count({
        where: { userId: { in: [...userIds] }, containerId: null },
      }),
    ]);
    if (rows.length === 0) return { ...empty, unattributed };

    const buckets = new Map<string, Map<string, Learner>>();
    for (const context of WORK_CONTEXTS) buckets.set(keyOf(context), new Map());

    for (const row of rows) {
      // Anything the service does not recognise joins the nameless bucket rather than
      // being dropped: the total has to add up to the attempts really made.
      const bucket = buckets.get(bucketKeyOf(row.workContext)) as Map<string, Learner>;
      const learner = bucket.get(row.userId) ?? { weight: 0, success: 0, attempts: 0 };
      const { succeeded, weight } = weighAttempt(row);
      learner.attempts += 1;
      learner.weight += weight;
      if (succeeded) learner.success += weight;
      bucket.set(row.userId, learner);
    }

    const buckets_ = WORK_CONTEXTS.map((context) => {
      const bucket = buckets.get(keyOf(context)) ?? new Map<string, Learner>();
      const attempts = [...bucket.values()].reduce((sum, learner) => sum + learner.attempts, 0);
      const rates = [...bucket.values()]
        .filter((learner) => learner.weight > 0)
        .map((learner) => learner.success / learner.weight);
      const distribution = distributionOf(rates);

      return {
        key: context,
        attempts,
        share: Math.round((attempts / rows.length) * 100),
        median: pct(distribution?.median ?? null),
      };
    });

    return { buckets: buckets_, unattributed };
  }
}

interface Learner {
  weight: number;
  success: number;
  attempts: number;
}

/** `null` keys a bucket of its own; a Map cannot be keyed by it directly. */
function keyOf(context: 'homework' | 'self_study' | 'classwork' | null): string {
  return context ?? UNSAID;
}

const UNSAID = '__unsaid__';

function bucketKeyOf(stored: string | null): string {
  const known = WORK_CONTEXTS.find((context) => context !== null && context === stored);
  return known ?? UNSAID;
}
