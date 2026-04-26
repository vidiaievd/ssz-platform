export type RevisionDecision = 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';

export interface SubmissionContent {
  text?: string;
  mediaRefs?: string[];
}

export interface SubmissionRevisionProps {
  id: string;
  submissionId: string;
  revisionNumber: number;
  content: SubmissionContent;
  submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  feedback: string | null;
  score: number | null;
  decision: RevisionDecision | null;
}

export class SubmissionRevision {
  readonly id: string;
  readonly submissionId: string;
  readonly revisionNumber: number;
  readonly content: SubmissionContent;
  readonly submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  feedback: string | null;
  score: number | null;
  decision: RevisionDecision | null;

  constructor(props: SubmissionRevisionProps) {
    this.id = props.id;
    this.submissionId = props.submissionId;
    this.revisionNumber = props.revisionNumber;
    this.content = props.content;
    this.submittedAt = props.submittedAt;
    this.reviewedBy = props.reviewedBy;
    this.reviewedAt = props.reviewedAt;
    this.feedback = props.feedback;
    this.score = props.score;
    this.decision = props.decision;
  }
}
