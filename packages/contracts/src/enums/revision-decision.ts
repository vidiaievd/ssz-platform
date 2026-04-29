export const RevisionDecision = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
} as const;

export type RevisionDecision = (typeof RevisionDecision)[keyof typeof RevisionDecision];
