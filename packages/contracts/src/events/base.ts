/**
 * Canonical RabbitMQ event envelope for all SSZ Platform services.
 * Every event published to the broker must conform to this shape.
 *
 * eventVersion uses semver-style strings ("1.0", "1.1", "2.0") to allow
 * consumers to detect breaking vs non-breaking changes without out-of-band
 * coordination.
 */
export interface BaseEvent<TPayload = unknown> {
  eventId: string;        // UUID v4
  eventType: string;      // routing key, e.g. "auth.user.registered"
  eventVersion: string;   // e.g. "1.0"
  occurredAt: string;     // ISO 8601
  source: string;         // originating service, e.g. "auth-service"
  correlationId?: string; // optional trace/correlation id
  payload: TPayload;
}

export type EventType = string;
