export const ProgressStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
} as const;

export type ProgressStatus = (typeof ProgressStatus)[keyof typeof ProgressStatus];
