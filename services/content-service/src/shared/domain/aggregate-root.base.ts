import { IDomainEvent } from './domain-event.interface.js';
import { Entity } from './entity.base.js';

export abstract class AggregateRoot extends Entity<string> {
  private _domainEvents: IDomainEvent[] = [];

  protected addDomainEvent(event: IDomainEvent): void {
    this._domainEvents.push(event);
  }

  getDomainEvents(): IDomainEvent[] {
    return [...this._domainEvents];
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
