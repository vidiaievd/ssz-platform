import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const NOTIFICATION_EVENT_TYPES = {
  EMAIL_SENT: 'notification.email_sent',
  EMAIL_PERMANENTLY_FAILED: 'notification.email_permanently_failed',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface EmailSentPayload {
  messageId: string;
  recipientEmail: string;
  recipientUserId: string | null;
  templateCode: string;
  category: string;
  providerMessageId: string | null;
}

export interface EmailPermanentlyFailedPayload {
  messageId: string;
  recipientEmail: string;
  recipientUserId: string | null;
  templateCode: string;
  lastError: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type EmailSentEvent = BaseEvent<EmailSentPayload>;
export type EmailPermanentlyFailedEvent = BaseEvent<EmailPermanentlyFailedPayload>;

export type AnyNotificationEvent = EmailSentEvent | EmailPermanentlyFailedEvent;
