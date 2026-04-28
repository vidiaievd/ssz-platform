export const EVENT_PUBLISHER = Symbol('IEventPublisher');

export interface IEventPublisher {
  publish<T>(
    eventType: string,
    payload: T,
    options?: { correlationId?: string },
  ): Promise<void>;
}
