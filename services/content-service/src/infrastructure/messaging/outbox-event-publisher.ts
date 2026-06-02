import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { BaseEvent } from '@ssz/contracts';
import { EXCHANGES } from '@ssz/contracts';
import type { IEventPublisher } from '../../shared/application/ports/event-publisher.port.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';

@Injectable()
export class OutboxEventPublisher implements IEventPublisher {
  private readonly exchange = EXCHANGES.CONTENT;

  constructor(private readonly outboxStore: PrismaOutboxStore) {}

  async publish<T>(
    eventType: string,
    payload: T,
    options?: { correlationId?: string },
  ): Promise<void> {
    const eventId = randomUUID();
    const occurredAt = new Date();

    const envelope: BaseEvent<T> = {
      eventId,
      eventType,
      eventVersion: '1.0',
      occurredAt: occurredAt.toISOString(),
      source: 'content-service',
      correlationId: options?.correlationId,
      payload,
    };

    await this.outboxStore.insertPending({
      id: randomUUID(),
      eventId,
      eventType,
      exchange: this.exchange,
      routingKey: eventType,
      payload: JSON.stringify(envelope),
      correlationId: options?.correlationId ?? null,
      occurredAt,
    });
  }
}
