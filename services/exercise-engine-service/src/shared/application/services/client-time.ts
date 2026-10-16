/**
 * When a call replayed from a phone's offline journal really happened (VoxOrd offline
 * plan, B4).
 *
 * The phone works an attempt with no network and sends its calls later, in a burst. Stamped
 * with the time they arrive, a week of practice lands on one evening: the schedule of every
 * word is computed from the wrong day, the dictation throttle refuses the second check of a
 * segment the student checked minutes apart, and the analytics show a learner who did
 * nothing all week. So the replay says when each call was made, and the server decides how
 * much of that to believe.
 *
 * The claim is two readings of the phone's clock: when the call was made (`at`) and when it
 * was sent (`sentAt`). Their difference is a duration on one clock, and a duration survives a
 * clock that is wrong by a constant amount — a phone set an hour ahead, or a year behind,
 * still measures the four days between answering and syncing correctly. What it does not
 * survive is the clock being moved in between; the bounds below are for that case.
 */
export interface ClientTimeClaim {
  at: Date;
  /** Absent when the caller sent only `at`: taken as it stands, then bounded. */
  sentAt: Date | null;
}

/**
 * How far back a replayed call may be dated — the lifetime of the phone's refresh token. A
 * journal older than that could not have been sent without signing in again, so a time
 * beyond it says the clock is wrong, not that the work is old.
 */
export const CLIENT_TIME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The time to record a call at.
 *
 * - no claim — the server's time, which is every online call;
 * - the claim, corrected by the skew between the phone's clock and the server's;
 * - never in the future: a claim later than now is now;
 * - never before `floor`, the last moment already recorded on the attempt, so the attempt's
 *   own history stays in order whatever the clock did between two calls;
 * - older than `CLIENT_TIME_MAX_AGE_MS` — the server's time. The work is kept rather than
 *   refused: losing a student's answers is worse than dating them wrongly.
 */
export function resolveClientTime(
  claim: ClientTimeClaim | null,
  serverNow: Date,
  floor: Date | null,
): Date {
  if (claim === null) return serverNow;

  const skew = claim.sentAt === null ? 0 : serverNow.getTime() - claim.sentAt.getTime();
  const corrected = claim.at.getTime() + skew;
  if (!Number.isFinite(corrected) || serverNow.getTime() - corrected > CLIENT_TIME_MAX_AGE_MS) {
    return serverNow;
  }

  const bounded = Math.min(corrected, serverNow.getTime());
  return new Date(floor === null ? bounded : Math.max(bounded, floor.getTime()));
}

/**
 * The time a call on an existing attempt is recorded at, with the attempt marked as worked
 * offline when the call was a replay. Floored at the attempt's own latest moment.
 */
export function stampReplayedCall(
  attempt: { readonly lastActivityAt: Date; markRecordedOffline(): void },
  claim: ClientTimeClaim | null,
  serverNow: Date,
): Date {
  if (claim !== null) attempt.markRecordedOffline();
  return resolveClientTime(claim, serverNow, attempt.lastActivityAt);
}
