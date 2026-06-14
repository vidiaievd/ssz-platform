import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface TeacherLanguagePayload {
  code: string;
  level?: string | null;
}

export class SchoolTeacherAcceptedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.teacher.accepted';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly userId: string,
    readonly schoolId: string,
    readonly languages: TeacherLanguagePayload[] | null,
    readonly firstName: string | null = null,
    readonly lastName: string | null = null,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
