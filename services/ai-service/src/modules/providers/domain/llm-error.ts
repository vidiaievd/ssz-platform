/**
 * The one error shape every adapter raises. The router decides on `retryable` alone whether
 * to try the fallback model, so an adapter that cannot classify a failure says `unknown`
 * rather than guessing.
 *
 * `invalid_response` is never raised by a provider: it is `SchemaGuard`'s verdict on an
 * answer that arrived but does not satisfy the requested schema.
 */
export type LlmErrorCode =
  | 'rate_limited'
  | 'overloaded'
  | 'timeout'
  | 'auth'
  | 'invalid_request'
  | 'filtered'
  | 'unavailable'
  | 'invalid_response'
  | 'unknown';

const RETRYABLE: ReadonlySet<LlmErrorCode> = new Set([
  'rate_limited',
  'overloaded',
  'timeout',
  'unavailable',
]);

export class LlmError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    readonly code: LlmErrorCode,
    message: string,
    options: { retryable?: boolean; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'LlmError';
    this.retryable = options.retryable ?? RETRYABLE.has(code);
    this.retryAfterMs = options.retryAfterMs;
  }
}
