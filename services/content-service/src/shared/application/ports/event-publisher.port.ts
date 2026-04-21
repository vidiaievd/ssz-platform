export const CONTENT_EVENT_PUBLISHER = Symbol('CONTENT_EVENT_PUBLISHER');

export interface IEventPublisher {
  publish<T>(eventType: string, payload: T, options?: { correlationId?: string }): Promise<void>;
}
