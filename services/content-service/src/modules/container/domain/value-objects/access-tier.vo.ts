import { Visibility } from './visibility.vo.js';

export enum AccessTier {
  ASSIGNED_ONLY = 'assigned_only',
  ENTITLEMENT_REQUIRED = 'entitlement_required',
  FREE_WITHIN_SCHOOL = 'free_within_school',
  PUBLIC_FREE = 'public_free',
  PUBLIC_PAID = 'public_paid',
}

export function getDefaultAccessTier(visibility: Visibility): AccessTier {
  if (visibility === Visibility.PUBLIC) return AccessTier.PUBLIC_FREE;
  return AccessTier.ASSIGNED_ONLY;
}
