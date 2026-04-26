import { Submission } from '../../../../../src/modules/review/domain/entities/submission.entity.js';
import {
  SubmissionCannotBeResubmittedError,
  SubmissionCannotBeReviewedError,
} from '../../../../../src/modules/review/domain/exceptions/submission.errors.js';

const NOW = new Date('2026-02-01T09:00:00Z');
const LATER = new Date('2026-02-01T10:00:00Z');
const REVIEWER = 'reviewer-001';

function freshSubmission(): Submission {
  return Submission.submit(
    {
      userId: 'user-001',
      exerciseId: 'exercise-001',
      content: { text: 'my answer' },
      schoolId: 'school-001',
    },
    NOW,
  );
}

describe('Submission', () => {
  describe('submit', () => {
    it('creates submission with PENDING_REVIEW status and revision 1', () => {
      const s = freshSubmission();

      expect(s.status).toBe('PENDING_REVIEW');
      expect(s.currentRevisionNumber).toBe(1);
      expect(s.revisions).toHaveLength(1);
      expect(s.revisions[0].revisionNumber).toBe(1);
      expect(s.revisions[0].content).toEqual({ text: 'my answer' });
    });

    it('emits SubmissionCreatedEvent', () => {
      const s = freshSubmission();
      const events = s.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.submission.created');
    });
  });

  describe('review', () => {
    it('approves a PENDING_REVIEW submission', () => {
      const s = freshSubmission();
      s.clearDomainEvents();

      const result = s.review(REVIEWER, 'APPROVED', 'well done', 1.0, LATER);

      expect(result.isOk).toBe(true);
      expect(s.status).toBe('APPROVED');

      const rev = s.revisions[0];
      expect(rev.decision).toBe('APPROVED');
      expect(rev.reviewedBy).toBe(REVIEWER);
      expect(rev.score).toBe(1.0);
      expect(rev.feedback).toBe('well done');
    });

    it('rejects a PENDING_REVIEW submission', () => {
      const s = freshSubmission();
      const result = s.review(REVIEWER, 'REJECTED', null, null, LATER);

      expect(result.isOk).toBe(true);
      expect(s.status).toBe('REJECTED');
    });

    it('requests revision on PENDING_REVIEW submission', () => {
      const s = freshSubmission();
      const result = s.review(REVIEWER, 'REVISION_REQUESTED', 'needs more detail', null, LATER);

      expect(result.isOk).toBe(true);
      expect(s.status).toBe('REVISION_REQUESTED');
    });

    it('emits SubmissionReviewedEvent', () => {
      const s = freshSubmission();
      s.clearDomainEvents();
      s.review(REVIEWER, 'APPROVED', null, null, LATER);

      const events = s.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.submission.reviewed');
    });

    it('fails when submission is already APPROVED', () => {
      const s = freshSubmission();
      s.review(REVIEWER, 'APPROVED', null, null, NOW);

      const result = s.review(REVIEWER, 'REJECTED', null, null, LATER);

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(SubmissionCannotBeReviewedError);
    });
  });

  describe('resubmit', () => {
    it('resubmits from REVISION_REQUESTED and increments revision number', () => {
      const s = freshSubmission();
      s.review(REVIEWER, 'REVISION_REQUESTED', 'redo this', null, NOW);
      s.clearDomainEvents();

      const result = s.resubmit({ text: 'improved answer' }, LATER);

      expect(result.isOk).toBe(true);
      expect(s.status).toBe('RESUBMITTED');
      expect(s.currentRevisionNumber).toBe(2);
      expect(s.revisions).toHaveLength(2);
      expect(s.revisions[1].content).toEqual({ text: 'improved answer' });
    });

    it('emits SubmissionResubmittedEvent', () => {
      const s = freshSubmission();
      s.review(REVIEWER, 'REVISION_REQUESTED', null, null, NOW);
      s.clearDomainEvents();
      s.resubmit({ text: 'v2' }, LATER);

      const events = s.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.submission.resubmitted');
    });

    it('fails when status is not REVISION_REQUESTED', () => {
      const s = freshSubmission();
      const result = s.resubmit({ text: 'v2' }, LATER);

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(SubmissionCannotBeResubmittedError);
    });

    it('allows review after resubmission', () => {
      const s = freshSubmission();
      s.review(REVIEWER, 'REVISION_REQUESTED', null, null, NOW);
      s.resubmit({ text: 'v2' }, LATER);

      const result = s.review(REVIEWER, 'APPROVED', null, null, LATER);

      expect(result.isOk).toBe(true);
      expect(s.status).toBe('APPROVED');
    });
  });
});
