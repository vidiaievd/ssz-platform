export interface OutboxRow {
  id: string;
  eventId: string;
  eventType: string;
  exchange: string;
  routingKey: string;
  payload: string;     // JSON-serialised BaseEvent envelope
  correlationId: string | null;
  occurredAt: Date;
  attempts: number;
}

export interface IOutboxStore {
  /** Write one pending row inside the caller's active transaction. */
  insertPending(row: Omit<OutboxRow, 'attempts'>): Promise<void>;
  /** Fetch up to `limit` unpublished rows, oldest first. */
  fetchPending(limit: number): Promise<OutboxRow[]>;
  /** Mark a row as successfully published. */
  markPublished(id: string): Promise<void>;
  /** Increment attempt counter (called on transient failure before requeue). */
  incrementAttempts(id: string): Promise<void>;
}

export const OUTBOX_STORE = Symbol('IOutboxStore');
