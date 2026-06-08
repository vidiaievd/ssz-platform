import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { SCHEDULING_EVENT_TYPES } from '@ssz/contracts';
import type { AlertRaisedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

const KIND_TO_TYPE: Record<string, NotificationType> = {
  overload:   NotificationType.OVERLOAD_ALERT,
  near_cap:   NotificationType.OVERLOAD_ALERT,
  vacancy:    NotificationType.VACANCY_ALERT,
  uncovered:  NotificationType.UNCOVERED_LESSON,
  sub_overload: NotificationType.OVERLOAD_ALERT,
};

@Injectable()
export class AlertRaisedHandler implements IMessageHandler<AlertRaisedPayload> {
  readonly routingKey = SCHEDULING_EVENT_TYPES.ALERT_RAISED;
  private readonly logger = new Logger(AlertRaisedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: AlertRaisedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Alert raised kind=${payload.kind} severity=${payload.severity} schoolId=${payload.schoolId} [${meta.eventId}]`,
    );

    const type = KIND_TO_TYPE[payload.kind] ?? NotificationType.GENERAL;

    await this.repo.create({
      recipientId: payload.schoolId,
      type,
      channel: NotificationChannel.IN_APP,
      subject: `Alert: ${payload.kind}`,
      templateKey: `alert_${payload.kind}`,
      templateData: {
        alertId: payload.alertId,
        schoolId: payload.schoolId,
        kind: payload.kind,
        severity: payload.severity,
        entityType: payload.entityType,
        entityId: payload.entityId,
        escalated: payload.escalated ?? false,
      },
    });
  }
}
