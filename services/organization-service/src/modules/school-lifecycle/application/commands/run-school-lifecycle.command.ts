/** One run of the lifecycle timer: close what is due, purge what is due, remind owners (plan 90, phase 5, step 2). */
export class RunSchoolLifecycleCommand {}

export interface SchoolLifecycleRunResult {
  /** False when another instance holds the timer's lock — this run did nothing. */
  ran: boolean;
  closed: number;
  purged: number;
  reminded: number;
  failed: number;
}
