export const RABBITMQ_HANDLERS = Symbol('RABBITMQ_HANDLERS');

export interface IMessageHandler<T = unknown> {
  readonly routingKey: string;
  handle(payload: T, meta: MessageMeta): Promise<void>;
}

export interface MessageMeta {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: string;
  correlationId?: string;
}
