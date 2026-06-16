-- Add enrollment notification types to the notification_type enum.

ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'ENROLLMENT_REQUEST';

ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'ENROLLMENT_APPROVED';

ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'ENROLLMENT_REJECTED';

ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'PLACEMENT_REVIEW_READY';

ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'GROUP_ASSIGNED';
