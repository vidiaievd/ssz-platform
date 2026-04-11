export interface IProcessedEventsRepository {
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, eventType: string): Promise<void>;
}

export const PROCESSED_EVENTS_REPOSITORY = Symbol(
  'PROCESSED_EVENTS_REPOSITORY',
);
