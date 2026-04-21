export interface AccessDecision {
  allowed: boolean;
  /** Short machine-readable reason — used for logging only, never sent to client. */
  reason?: string;
}
