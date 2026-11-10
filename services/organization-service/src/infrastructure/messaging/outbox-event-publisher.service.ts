import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { BaseEvent } from '@ssz/contracts';
import type { OutboxRow } from '@ssz/messaging';
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
  'tutoring.invitation.sent': 'tutoring.invitation.sent',
  'tutoring.group.created': 'tutoring.group.created',
  'tutoring.student.added': 'tutoring.student.added',
  'tutoring.student.removed': 'tutoring.student.removed',
  // School lifecycle (plan 90, phase 5) — written by the lifecycle repository inside its transaction.
  'school.suspended': 'school.suspended',
  'school.reactivated': 'school.reactivated',
  'school.closed': 'school.closed',
  'school.restored': 'school.restored',
  'school.purged': 'school.purged',
  'school.purge.reminder': 'school.purge.reminder',
};

/**
 * The outbox row for a domain event (organization's envelope), or null when the type has no routing
 * key. Shared by the publisher and by repositories that write the event inside their own transaction.
 */
export function outboxRowOf(event: IDomainEvent): Omit<OutboxRow, 'attempts'> | null {
  const routingKey = ROUTING_KEYS[event.eventType];
  if (!routingKey) return null;

  const envelope: BaseEvent<IDomainEvent> = {
    eventId: event.eventId,
    eventType: event.eventType,
    eventVersion: '1.0',
    occurredAt: event.occurredAt.toISOString(),
    source: 'organization-service',
    payload: event,
  };
  return {
    id: randomUUID(),
    eventId: event.eventId,
    eventType: event.eventType,
    exchange: EXCHANGE,
    routingKey,
    payload: JSON.stringify(envelope),
    correlationId: null,
    occurredAt: event.occurredAt,
  };
}

@Injectable()
export class OutboxEventPublisherService implements IEventPublisher {
  private readonly logger = new Logger(OutboxEventPublisherService.name);

  constructor(private readonly outboxStore: PrismaOutboxStore) {}

  async publish(event: IDomainEvent): Promise<void> {
    const row = outboxRowOf(event);
    if (!row) {
      this.logger.error(
        `No routing key for event type "${event.eventType}" [${event.eventId}] — event dropped, not published`,
      );
      return;
    }
    await this.outboxStore.insertPending(row);
  }
}
