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

/**
 * A lesson its learners can see changed when or whether it happens (VoxOrd mobile redesign
 * 06, step 6c): moved to another day or time, cancelled, or a cancellation undone
 * (`scheduled`). Raised for lessons not yet in the past; a retopic, a room or a mark is not
 * this event.
 */
export interface LessonStatusChangedPayload {
  lessonId: string;
  schoolId: string;
  groupId: string;
  newStatus: 'scheduled' | 'moved' | 'cancelled';
  /** null when nobody is set to teach it. */
  teacherId: string | null;
  /** YYYY-MM-DD — the day it is on now (the day it was on, when cancelled). */
  date: string;
  /** Additive (step 6c): HH:MM, as now. */
  startTime?: string;
  endTime?: string;
  /** Additive (step 6c): `lesson` | `exam` | `make_up` | `review`. */
  lessonType?: string;
  /** Additive (step 6c): when it was before a move; absent on a cancellation or a restore. */
  previousDate?: string;
  previousStartTime?: string;
  previousEndTime?: string;
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
