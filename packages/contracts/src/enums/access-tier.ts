/**
 * Access tier for content entitlement (Content Service).
 * Determines the payment / entitlement model for accessing content.
 */
export const AccessTier = {
  ASSIGNED_ONLY: 'ASSIGNED_ONLY',
  ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
  FREE_WITHIN_SCHOOL: 'FREE_WITHIN_SCHOOL',
  PUBLIC_FREE: 'PUBLIC_FREE',
  PUBLIC_PAID: 'PUBLIC_PAID',
} as const;

export type AccessTier = (typeof AccessTier)[keyof typeof AccessTier];
