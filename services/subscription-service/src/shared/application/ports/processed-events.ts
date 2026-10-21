/** Events from other services already acted on — what makes a consumer idempotent. */
export interface IProcessedEvents {
  isProcessed(eventId: string): Promise<boolean>;
  /** A second mark of the same event (a parallel redelivery) is ignored. */
  markProcessed(eventId: string, eventType: string): Promise<void>;
}

export const PROCESSED_EVENTS = Symbol('PROCESSED_EVENTS');
