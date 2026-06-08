import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const SCHEDULING_EVENT_TYPES = {
  TEACHER_ABSENCE_REPORTED:   'scheduling.teacher.absence.reported',
  SUBSTITUTE_REQUEST_CREATED: 'scheduling.substitute.request.created',
  SUBSTITUTE_ASSIGNED:        'scheduling.substitute.assigned',
  SUBSTITUTE_CONFIRMED:       'scheduling.substitute.confirmed',
  SCHEDULE_RECALCULATED:      'scheduling.schedule.recalculated',
  CONFLICT_DETECTED:          'scheduling.conflict.detected',
  ALERT_RAISED:               'scheduling.alert.raised',
  ALERT_ACKNOWLEDGED:         'scheduling.alert.acknowledged',
  LESSON_STATUS_CHANGED:      'scheduling.lesson.status.changed',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface TeacherAbsenceReportedPayload {
  absenceId: string;
  schoolId: string;
  teacherId: string;
  kind: 'sick' | 'leave' | 'vacancy';
  scope: 'today' | 'window' | 'permanent';
  fromDate: string; // ISO date
  toDate: string | null;
  createdSubstituteRequestIds: string[];
}

export interface SubstituteRequestCreatedPayload {
  requestId: string;
  schoolId: string;
  groupId: string;
  lessonId: string;
  originalTeacherId: string;
  urgency: 'today' | 'upcoming' | 'open';
  coverFrom: string;
  coverTo: string;
}

export interface SubstituteAssignedPayload {
  assignmentId: string;
  requestId: string;
  schoolId: string;
  groupId: string;
  lessonId: string;
  originalTeacherId: string;
  substituteTeacherId: string;
  coverFrom: string;
  coverTo: string;
  fitScore: number;
}

export interface SubstituteConfirmedPayload {
  assignmentId: string;
  schoolId: string;
  groupId: string;
  substituteTeacherId: string;
  originalTeacherId: string;
  coverFrom: string;
  coverTo: string;
  reason: string;
}

export interface ScheduleRecalculatedPayload {
  schoolId: string;
  groupId: string;
  affectedLessonIds: string[];
}

export interface ConflictDetectedPayload {
  schoolId: string;
  conflictType: 'teacher_overlap' | 'room_double_book' | 'no_candidate' | 'curriculum_override';
  teacherId?: string;
  groupAId?: string;
  groupBId?: string;
  lessonId?: string;
  day?: string;
  time?: string;
}

export interface AlertRaisedPayload {
  alertId: string;
  schoolId: string;
  kind: string;
  severity: 'warn' | 'danger';
  entityType?: string;
  entityId?: string;
  escalated?: boolean;
}

export interface AlertAcknowledgedPayload {
  alertId: string;
  schoolId: string;
  acknowledgedBy: string;
}

export interface LessonStatusChangedPayload {
  lessonId: string;
  schoolId: string;
  groupId: string;
  newStatus: 'scheduled' | 'moved' | 'cancelled';
  teacherId: string;
  date: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type TeacherAbsenceReportedEvent   = BaseEvent<TeacherAbsenceReportedPayload>;
export type SubstituteRequestCreatedEvent = BaseEvent<SubstituteRequestCreatedPayload>;
export type SubstituteAssignedEvent       = BaseEvent<SubstituteAssignedPayload>;
export type SubstituteConfirmedEvent      = BaseEvent<SubstituteConfirmedPayload>;
export type ScheduleRecalculatedEvent     = BaseEvent<ScheduleRecalculatedPayload>;
export type ConflictDetectedEvent         = BaseEvent<ConflictDetectedPayload>;
export type AlertRaisedEvent              = BaseEvent<AlertRaisedPayload>;
export type AlertAcknowledgedEvent        = BaseEvent<AlertAcknowledgedPayload>;
export type LessonStatusChangedEvent      = BaseEvent<LessonStatusChangedPayload>;

export type AnySchedulingEvent =
  | TeacherAbsenceReportedEvent
  | SubstituteRequestCreatedEvent
  | SubstituteAssignedEvent
  | SubstituteConfirmedEvent
  | ScheduleRecalculatedEvent
  | ConflictDetectedEvent
  | AlertRaisedEvent
  | AlertAcknowledgedEvent
  | LessonStatusChangedEvent;
