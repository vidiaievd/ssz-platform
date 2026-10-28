import { randomUUID } from 'node:crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import type {
  AttemptReviewAiPolicy,
  AttemptStatus,
  ProvisionalAiVerdict,
} from '../../../attempts/domain/entities/attempt.entity.js';
import { TEMPLATE_CODE as READ_ALOUD } from '@ssz/shared-kernel/read-aloud';
import type { RubricMarks } from '@ssz/shared-kernel/writing-task';
import {
  settledStatus,
  settleOutcomes,
  type ReviewerOutcomes,
  type SettledOutcomes,
} from '../draft-outcomes.js';
import type { DraftReading } from '../reading-verdict.js';

/** Names as Prisma carries them (`AiDraftStatus`), so the mapper passes them through. */
export type AiDraftStatus = 'READY' | 'FAILED' | 'SENT' | 'EDITED' | 'DISCARDED';

/** What ai-service may write. The other three are the teacher's, set by the verdict (`settle`). */
export type ProposedDraftStatus = Extract<AiDraftStatus, 'READY' | 'FAILED'>;

/**
 * ai-service capabilities that leave a draft on an attempt, each with its own audience in
 * `draftRefusal`: `review_draft` is help for a teacher, `review_direct` (plan 79, part 2) is
 * the review itself for the learner — written with its verdict (`ai-review`). At a school
 * that lets a model answer first (plan 80) the learner's review is the teacher's draft too.
 * `voice_review` (plan 82) is the learner's review of a `read_aloud` reading, by ear: the
 * same audience as `review_direct`, a different subject.
 */
export const AI_DRAFT_CAPABILITIES = ['review_draft', 'review_direct', 'voice_review'] as const;
export type AiDraftCapability = (typeof AI_DRAFT_CAPABILITIES)[number];

/** The learner's review of this template: by ear for a reading (plan 82), over text otherwise. */
export function learnerReviewCapability(templateCode: string): Extract<AiDraftCapability, 'review_direct' | 'voice_review'> {
  return templateCode === READ_ALOUD ? 'voice_review' : 'review_direct';
}

/**
 * One remark, as ai-service verified it: `fragment` occurs verbatim in that item's answer,
 * or is null for a remark about a text as a whole (writing_task `task` / `structure`).
 */
export interface AiDraftRemark {
  itemId: string;
  sentenceIndex: number;
  aspect: string;
  fragment: string | null;
  comment: string;
  suggestion: string | null;
}

/**
 * A suggested mark on one rubric criterion (plan 79, 1.7c), keyed by the id in the attempt's
 * rubric snapshot. Shown beside the teacher's control, never set on it.
 */
export interface AiDraftMark {
  criterionId: string;
  mark: 0 | 1 | 2 | 3;
  reason: string;
}

/** One write from ai-service — a draft, or the record that none could be made. */
export interface ProposedDraft {
  status: ProposedDraftStatus;
  items: AiDraftRemark[];
  summary: string | null;
  /** One per criterion; null when the model was not asked for marks. */
  marks: AiDraftMark[] | null;
  errorCode: string | null;
  providerId: string | null;
  modelId: string | null;
  promptVersion: string | null;
  aiCallId: string;
  /**
   * `voice_review` only: what was heard in each prompt and the check the verdict was computed
   * from (plan 82, step 7). Written by the engine beside ai-service's write, never taken from it.
   */
  reading?: DraftReading | null;
}

export type DraftRefusal =
  /** The submission is not waiting on a teacher: decided, returned, or never routed. */
  | 'ATTEMPT_NOT_IN_REVIEW'
  /** A teacher's draft on work no teacher reviews (no school) — part 2's ground, not this one's. */
  | 'NO_TEACHER_REVIEW'
  /** A model's verdict on work a teacher reviews (a school's) — theirs is the one that counts. */
  | 'HAS_TEACHER_REVIEW'
  /**
   * A teacher's draft on work the school has a model answer first (plan 80): the review the
   * learner was given is the one the teacher reads, and a second model's would contradict it.
   */
  | 'AI_REVIEWS_FIRST'
  /**
   * The teacher already acted on the draft that is there — or, for a school's work, the model's
   * review already reached the learner, and replacing it would change what they read.
   */
  | 'DRAFT_DECIDED';

/**
 * Whether an attempt takes a draft of this capability at all. A draft is help for whoever
 * reviews the submission, so it only makes sense while the submission waits in a queue
 * that reviewer reads. A direct review is the reverse: it is for the learner whose work no
 * queue shows to anyone (plan 79 §0) — or a school's work, where the school lets a model
 * answer first (the policy taken at hand-in, plan 80); there it replaces the teacher's draft.
 */
export function draftRefusal(
  attempt: {
    status: AttemptStatus;
    schoolId: string | null;
    reviewAiPolicy?: AttemptReviewAiPolicy | null;
    provisionalAiVerdict?: ProvisionalAiVerdict | null;
  },
  capability: AiDraftCapability,
): DraftRefusal | null {
  if (attempt.status !== 'ROUTED_FOR_REVIEW') return 'ATTEMPT_NOT_IN_REVIEW';
  if (capability === 'review_draft') {
    if (attempt.schoolId === null) return 'NO_TEACHER_REVIEW';
    if (attempt.reviewAiPolicy) return 'AI_REVIEWS_FIRST';
    return null;
  }
  if (attempt.schoolId === null) return null;
  if (!attempt.reviewAiPolicy) return 'HAS_TEACHER_REVIEW';
  if (attempt.provisionalAiVerdict) return 'DRAFT_DECIDED';
  return null;
}

/**
 * The draft a teacher's card shows and the verdict settles: the model's help for the
 * teacher, or — where the school has a model answer first (plan 80) — the review the
 * learner was already given.
 */
export function teacherDraftCapability(attempt: {
  reviewAiPolicy?: AttemptReviewAiPolicy | null;
  templateCode: string;
}): AiDraftCapability {
  return attempt.reviewAiPolicy ? learnerReviewCapability(attempt.templateCode) : 'review_draft';
}

export interface AttemptAiDraftProps extends Omit<ProposedDraft, 'status'> {
  attemptId: string;
  capability: string;
  status: AiDraftStatus;
  /** What the verdict made of it, remark by remark (1.5). Null until decided. */
  outcomes?: SettledOutcomes | null;
  decidedAt?: Date | null;
  /** The learner said this `review_direct` review is wrong (2.3b). Null until they do. */
  disputedAt?: Date | null;
  disputeReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A model's draft review of one submission (plan 79, step 1.2). A property of the attempt:
 * one per capability, replaced by a rerun only while nobody has acted on it.
 */
export class AttemptAiDraft extends Entity<string> {
  private constructor(
    id: string,
    private props: AttemptAiDraftProps,
  ) {
    super(id);
  }

  static propose(attemptId: string, capability: AiDraftCapability, draft: ProposedDraft, now: Date): AttemptAiDraft {
    return new AttemptAiDraft(randomUUID(), { ...draft, attemptId, capability, createdAt: now, updatedAt: now });
  }

  static restore(id: string, props: AttemptAiDraftProps): AttemptAiDraft {
    return new AttemptAiDraft(id, props);
  }

  /** The teacher sent, edited or discarded it: what the model offered is now labelled data. */
  get isDecided(): boolean {
    return this.props.status === 'SENT' || this.props.status === 'EDITED' || this.props.status === 'DISCARDED';
  }

  /**
   * A rerun's draft takes the place of one nobody has acted on. A decided draft stays as it
   * is — overwriting it would lose what the teacher was offered.
   */
  replaceWith(draft: ProposedDraft, now: Date): DraftRefusal | null {
    if (this.isDecided) return 'DRAFT_DECIDED';
    this.props = { ...this.props, ...draft, reading: draft.reading ?? null, updatedAt: now };
    return null;
  }

  /**
   * The verdict's word on the draft (plan 79, 1.5). Only a `READY` draft is settled: a
   * `FAILED` one had nothing to act on. A decided one is settled again — the verdict that
   * labelled it did not land (the attempt is still waiting, or the caller would not be here),
   * and the one that does is the teacher's last word.
   */
  settle(outcomes: ReviewerOutcomes, rubricMarks: RubricMarks | null, now: Date): SettledOutcomes | null {
    if (this.props.status === 'FAILED') return null;
    const settled = settleOutcomes(
      {
        remarkCount: this.props.items.length,
        hasSummary: (this.props.summary ?? '').trim() !== '',
        marks: this.props.marks,
      },
      outcomes,
      rubricMarks,
    );
    this.props = {
      ...this.props,
      status: settledStatus(settled),
      outcomes: settled,
      decidedAt: now,
      updatedAt: now,
    };
    return settled;
  }

  get attemptId(): string { return this.props.attemptId; }
  get capability(): string { return this.props.capability; }
  get status(): AiDraftStatus { return this.props.status; }
  get items(): AiDraftRemark[] { return this.props.items; }
  get summary(): string | null { return this.props.summary; }
  get marks(): AiDraftMark[] | null { return this.props.marks ?? null; }
  get reading(): DraftReading | null { return this.props.reading ?? null; }
  get errorCode(): string | null { return this.props.errorCode; }
  get providerId(): string | null { return this.props.providerId; }
  get modelId(): string | null { return this.props.modelId; }
  get promptVersion(): string | null { return this.props.promptVersion; }
  get aiCallId(): string { return this.props.aiCallId; }
  get outcomes(): SettledOutcomes | null { return this.props.outcomes ?? null; }
  get decidedAt(): Date | null { return this.props.decidedAt ?? null; }
  get disputedAt(): Date | null { return this.props.disputedAt ?? null; }
  get disputeReason(): string | null { return this.props.disputeReason ?? null; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
