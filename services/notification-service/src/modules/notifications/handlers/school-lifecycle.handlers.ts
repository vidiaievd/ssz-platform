import { Injectable, Logger } from '@nestjs/common';
import { ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { SchoolLifecyclePayload, SchoolPurgeReminderPayload } from '@ssz/contracts';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { SchoolLifecycleLetter } from '../../../infrastructure/email/templates/school-lifecycle.template.js';
import { NotificationsService } from '../notifications.service.js';
import { OwnerContactClient } from '../schedules/clients/owner-contact.client.js';

interface OwnerLetter {
  letter: SchoolLifecycleLetter;
  schoolId: string;
  ownerId: string;
  schoolName: string;
  closesAt?: string | null;
  purgeAt?: string | null;
  daysLeft?: number;
}

/**
 * Looks the owner up and sends the letter. No address → nothing to send (a deleted owner), which is
 * not a failure; a profile-service outage throws, and the consumer requeues the event once.
 */
@Injectable()
export class SchoolOwnerMailer {
  private readonly logger = new Logger(SchoolOwnerMailer.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly contacts: OwnerContactClient,
  ) {}

  async send(input: OwnerLetter, meta: MessageMeta): Promise<void> {
    const contact = await this.contacts.contactOf(input.ownerId);
    if (!contact) {
      this.logger.warn(`No address for owner=${input.ownerId} of school=${input.schoolId}; "${input.letter}" letter skipped [${meta.eventId}]`);
      return;
    }

    await this.notifications.sendSchoolLifecycleEmail({
      ...input,
      locale: contact.uiLocale,
      email: contact.email,
    });
  }
}

@Injectable()
export class SchoolSuspendedHandler implements IMessageHandler<SchoolLifecyclePayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.SCHOOL_SUSPENDED;

  constructor(private readonly mailer: SchoolOwnerMailer) {}

  async handle(payload: SchoolLifecyclePayload, meta: MessageMeta): Promise<void> {
    await this.mailer.send(
      { letter: 'suspended', schoolId: payload.schoolId, ownerId: payload.ownerId, schoolName: payload.name, closesAt: payload.closesAt },
      meta,
    );
  }
}

@Injectable()
export class SchoolClosedHandler implements IMessageHandler<SchoolLifecyclePayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.SCHOOL_CLOSED;

  constructor(private readonly mailer: SchoolOwnerMailer) {}

  async handle(payload: SchoolLifecyclePayload, meta: MessageMeta): Promise<void> {
    await this.mailer.send(
      { letter: 'closed', schoolId: payload.schoolId, ownerId: payload.ownerId, schoolName: payload.name, purgeAt: payload.purgeAt },
      meta,
    );
  }
}

@Injectable()
export class SchoolRestoredHandler implements IMessageHandler<SchoolLifecyclePayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.SCHOOL_RESTORED;

  constructor(private readonly mailer: SchoolOwnerMailer) {}

  async handle(payload: SchoolLifecyclePayload, meta: MessageMeta): Promise<void> {
    await this.mailer.send(
      { letter: 'restored', schoolId: payload.schoolId, ownerId: payload.ownerId, schoolName: payload.name },
      meta,
    );
  }
}

@Injectable()
export class SchoolPurgeReminderHandler implements IMessageHandler<SchoolPurgeReminderPayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.SCHOOL_PURGE_REMINDER;

  constructor(private readonly mailer: SchoolOwnerMailer) {}

  async handle(payload: SchoolPurgeReminderPayload, meta: MessageMeta): Promise<void> {
    await this.mailer.send(
      {
        letter: 'purge_reminder',
        schoolId: payload.schoolId,
        ownerId: payload.ownerId,
        schoolName: payload.name,
        purgeAt: payload.purgeAt,
        daysLeft: payload.daysLeft,
      },
      meta,
    );
  }
}
