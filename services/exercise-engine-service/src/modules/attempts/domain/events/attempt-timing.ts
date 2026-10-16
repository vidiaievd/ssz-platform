/**
 * When the work an `exercise.attempt.completed` reports was done, and whether it was done
 * offline (VoxOrd offline plan, B4). Shared by every payload published under that key.
 *
 * The envelope's `occurredAt` is when the event was published. For an attempt worked on a
 * phone with no network and replayed days later, that is the day of the sync, not the day of
 * the practice; `attemptedAt` is the latter, as far as the server believed the phone's clock.
 */
export interface AttemptTiming {
  /**
   * When the verdict was reached: the scoring, a teacher's review, or — for work handed to a
   * teacher — the submission. Absent on events published before the field existed; a
   * consumer falls back to the envelope's `occurredAt`.
   */
  attemptedAt?: string;
  /**
   * The attempt was worked offline and replayed from the phone's journal. Absent means it
   * was not. Kept so the use of offline practice can be measured.
   */
  recordedOffline?: boolean;
}
