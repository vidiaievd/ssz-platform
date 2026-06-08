import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EXCHANGES, SCHEDULING_EVENT_TYPES } from '@ssz/contracts';
import { PrismaOutboxStore } from './prisma-outbox.store.js';

export const SCHEDULING_EVENT_PUBLISHER = Symbol('ISchedulingEventPublisher');

export interface ISchedulingEventPublisher {
  publish(eventType: string, payload: unknown): Promise<void>;
}

@Injectable()
export class SchedulingEventPublisherService implements ISchedulingEventPublisher {
  constructor(private readonly outboxStore: PrismaOutboxStore) {}

  async publish(eventType: string, payload: unknown): Promise<void> {
    const eventId = randomUUID();
    const now = new Date();

    const envelope = {
      eventId,
      eventType,
      eventVersion: '1.0',
      occurredAt: now.toISOString(),
      source: 'scheduling-service',
      payload,
    };

    await this.outboxStore.insertPending({
      id: randomUUID(),
      eventId,
      eventType,
      exchange: EXCHANGES.SCHEDULING,
      routingKey: eventType,
      payload: JSON.stringify(envelope),
      correlationId: null,
      occurredAt: now,
    });
  }
}
