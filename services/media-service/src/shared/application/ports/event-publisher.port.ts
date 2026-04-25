export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface IEventPublisher {
  publish<T>(eventType: string, payload: T, options?: { correlationId?: string }): Promise<void>;
}
