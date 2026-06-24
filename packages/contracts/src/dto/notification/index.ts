/**
 * Shared shape of a single in-app notification feed item, as returned by
 * notification-service's `GET /notifications` and consumed by the web BFF.
 */
export interface InAppNotificationDto {
  id: string;
  type: string;
  templateData: Record<string, unknown>;
  isRead: boolean;
  archivedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
}
