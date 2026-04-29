export const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  SCORED: 'SCORED',
  ROUTED_FOR_REVIEW: 'ROUTED_FOR_REVIEW',
  ABANDONED: 'ABANDONED',
} as const;

export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];
