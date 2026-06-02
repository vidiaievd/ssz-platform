import type { BaseEvent } from '../base.js';

export const ANALYTICS_EVENT_TYPES = {
  NUDGE_REQUESTED: 'analytics.nudge.requested',
} as const;

export interface NudgeRequestedPayload {
  schoolId: string;
  userId: string;
  requestedBy: string;
}

export type NudgeRequestedEvent = BaseEvent<NudgeRequestedPayload>;

export type AnyAnalyticsEvent = NudgeRequestedEvent;
