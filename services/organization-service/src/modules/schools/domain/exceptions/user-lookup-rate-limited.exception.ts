/** 429 `LOOKUP_RATE_LIMITED` — the asker looked up too many addresses in the window (plan 90, session 16 remark 4). */
export class UserLookupRateLimitedException extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterMs: number) {
    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    super(`Too many address lookups. Try again in ${seconds} second(s)`);
    this.name = 'UserLookupRateLimitedException';
    this.retryAfterSeconds = seconds;
  }
}
