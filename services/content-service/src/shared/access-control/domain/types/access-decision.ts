export interface AccessDecision {
  allowed: boolean;
  /**
   * Short machine-readable reason. Never sent to the client. Logged, and read by
   * `isStaffGrant` to tell a teacher's view from a learner's.
   */
  reason?: string;
}
