/**
 * How far back replayed work may be dated (VoxOrd offline plan, B4): 30 days, the longest
 * refresh-token lifetime a phone gets (ADR-012). A time beyond it is more likely a wrong clock
 * than a month of work nobody sent. The same bound the exercise engine puts on a replayed
 * attempt.
 */
export const REPLAYED_TIME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The moment to record work at that may have been done on a phone with no network: a
 * review replayed from its offline queue, or an attempt worked offline that reaches this
 * service days after it was made.
 *
 * - none given — now;
 * - in the future — now;
 * - older than `REPLAYED_TIME_MAX_AGE_MS` — now: the phone's clock is wrong, and the work is
 *   kept rather than refused;
 * - before `floor` — the floor.
 *
 * The floor is for spaced repetition, which measures the interval from a card's last review.
 * The case is real: answered on the phone on Monday, reviewed on the web on Tuesday, synced
 * on Wednesday. Floored, Monday's answer lands right after Tuesday's, as a second review
 * straight after the first, which FSRS barely moves the card for; dated Monday it would be a
 * negative interval, and dated Wednesday it would invent a day the learner did not wait.
 */
export function boundReplayedTime(
  claimed: Date | undefined,
  now: Date,
  floor: Date | null = null,
): Date {
  let at = now.getTime();
  if (claimed !== undefined) {
    const time = claimed.getTime();
    if (Number.isFinite(time) && now.getTime() - time <= REPLAYED_TIME_MAX_AGE_MS) {
      at = Math.min(time, now.getTime());
    }
  }
  if (floor !== null && at < floor.getTime()) at = floor.getTime();
  return new Date(at);
}
