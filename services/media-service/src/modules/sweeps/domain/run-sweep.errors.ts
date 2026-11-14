/**
 * Why the panel's sweep run is refused (plan 90, phase 8, step 4). The controller maps them:
 * `SWEEP_RUNNING` → 409, `ADMIN_LEVEL_REQUIRED` → 403, `REASON_REQUIRED` → 400.
 */
export type RunSweepError =
  /** A run of this kind is going in this process; nothing was started. */
  | { code: 'SWEEP_RUNNING' }
  /** Deleting takes `super`; a dry run takes `admin`. */
  | { code: 'ADMIN_LEVEL_REQUIRED'; requiredLevel: 'super' }
  /** Deleting needs a non-empty reason — it goes on the trail. */
  | { code: 'REASON_REQUIRED' };
