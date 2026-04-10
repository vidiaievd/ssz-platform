import type { IDomainEvent } from '../../domain/domain-event.interface.js';

export interface IEventPublisher {
  publish(event: IDomainEvent): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
