import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { BaseEvent } from '@ssz/contracts';
import type { IEventPublisher } from '../../shared/application/ports/event-publisher.interface.js';
import type { IDomainEvent } from '../../shared/domain/domain-event.interface.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';

const EXCHANGE = 'organization.events';

// Routing key map — keeps parity with the old RabbitMqEventPublisher.
const ROUTING_KEYS: Record<string, string> = {
  'school.created': 'school.created',
  'school.member.added': 'school.member.added',
  'school.member.removed': 'school.member.removed',
  'school.student.removed': 'school.student.removed',
  'school.student.nudged': 'school.student.nudged',
  'school.invitation.sent': 'school.invitation.sent',
  'user.platform.role.assigned': 'user.platform.role.assigned',
  'school.teacher.accepted': 'school.teacher.accepted',
  'organization.teacher.profile_changed': 'organization.teacher.profile_changed',
  'school.group.published': 'school.group.published',
  'school.group.archived': 'school.group.archived',
  'school.group.member.added': 'school.group.member.added',
  'school.group.member.removed': 'school.group.member.removed',
  'school.group.material.added': 'school.group.material.added',
  'school.group.material.removed': 'school.group.material.removed',
  'school.enrollment.requested': 'school.enrollment.requested',
  'school.enrollment.approved': 'school.enrollment.approved',
  'school.enrollment.rejected': 'school.enrollment.rejected',
  'school.enrollment.placement_review_ready': 'school.enrollment.placement_review_ready',
  'school.enrollment.group_assigned': 'school.enrollment.group_assigned',
};

@Injectable()
export class OutboxEventPublisherService implements IEventPublisher {
  constructor(private readonly outboxStore: PrismaOutboxStore) {}

  async publish(event: IDomainEvent): Promise<void> {
    const routingKey = ROUTING_KEYS[event.eventType];
    if (!routingKey) return; // unknown event type — skip (same behaviour as before)

    const envelope: BaseEvent<IDomainEvent> = {
      eventId: event.eventId,
      eventType: event.eventType,
      eventVersion: '1.0',
      occurredAt: event.occurredAt.toISOString(),
      source: 'organization-service',
      payload: event,
    };

    await this.outboxStore.insertPending({
      id: randomUUID(),
      eventId: event.eventId,
      eventType: event.eventType,
      exchange: EXCHANGE,
      routingKey,
      payload: JSON.stringify(envelope),
      correlationId: null,
      occurredAt: event.occurredAt,
    });
  }
}
