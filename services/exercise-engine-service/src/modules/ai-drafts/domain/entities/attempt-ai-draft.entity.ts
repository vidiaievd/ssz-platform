import { randomUUID } from 'node:crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import type { AttemptStatus } from '../../../attempts/domain/entities/attempt.entity.js';
import {
  settledStatus,
  settleOutcomes,
  type ReviewerOutcomes,
  type SettledOutcomes,
} from '../draft-outcomes.js';

/** Names as Prisma carries them (`AiDraftStatus`), so the mapper passes them through. */
export type AiDraftStatus = 'READY' | 'FAILED' | 'SENT' | 'EDITED' | 'DISCARDED';

/** What ai-service may write. The other three are the teacher's, set by the verdict (`settle`). */
export type ProposedDraftStatus = Extract<AiDraftStatus, 'READY' | 'FAILED'>;

/**
 * ai-service capabilities that leave a draft on an attempt. `review_direct` (plan 79, part 2)
 * joins with its own audience rule in `draftRefusal`.
 */
export const AI_DRAFT_CAPABILITIES = ['review_draft'] as const;
export type AiDraftCapability = (typeof AI_DRAFT_CAPABILITIES)[number];

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

/** One write from ai-service — a draft, or the record that none could be made. */
export interface ProposedDraft {
  status: ProposedDraftStatus;
  items: AiDraftRemark[];
  summary: string | null;
  errorCode: string | null;
  providerId: string | null;
  modelId: string | null;
  promptVersion: string | null;
  aiCallId: string;
}

export type DraftRefusal =
  /** The submission is not waiting on a teacher: decided, returned, or never routed. */
  | 'ATTEMPT_NOT_IN_REVIEW'
  /** A teacher's draft on work no teacher reviews (no school) — part 2's ground, not this one's. */
  | 'NO_TEACHER_REVIEW'
  /** The teacher already acted on the draft that is there. */
  | 'DRAFT_DECIDED';

/**
 * Whether an attempt takes a draft of this capability at all. A draft is help for whoever
 * reviews the submission, so it only makes sense while the submission waits in a queue
 * that reviewer reads.
 */
export function draftRefusal(
  attempt: { status: AttemptStatus; schoolId: string | null },
  capability: AiDraftCapability,
): DraftRefusal | null {
  if (attempt.status !== 'ROUTED_FOR_REVIEW') return 'ATTEMPT_NOT_IN_REVIEW';
  if (capability === 'review_draft' && attempt.schoolId === null) return 'NO_TEACHER_REVIEW';
  return null;
}

export interface AttemptAiDraftProps extends Omit<ProposedDraft, 'status'> {
  attemptId: string;
  capability: string;
  status: AiDraftStatus;
  /** What the verdict made of it, remark by remark (1.5). Null until decided. */
  outcomes?: SettledOutcomes | null;
  decidedAt?: Date | null;
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
    this.props = { ...this.props, ...draft, updatedAt: now };
    return null;
  }

  /**
   * The verdict's word on the draft (plan 79, 1.5). Only a `READY` draft is settled: a
   * `FAILED` one had nothing to act on. A decided one is settled again — the verdict that
   * labelled it did not land (the attempt is still waiting, or the caller would not be here),
   * and the one that does is the teacher's last word.
   */
  settle(outcomes: ReviewerOutcomes, now: Date): SettledOutcomes | null {
    if (this.props.status === 'FAILED') return null;
    const settled = settleOutcomes(
      { remarkCount: this.props.items.length, hasSummary: (this.props.summary ?? '').trim() !== '' },
      outcomes,
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
  get errorCode(): string | null { return this.props.errorCode; }
  get providerId(): string | null { return this.props.providerId; }
  get modelId(): string | null { return this.props.modelId; }
  get promptVersion(): string | null { return this.props.promptVersion; }
  get aiCallId(): string { return this.props.aiCallId; }
  get outcomes(): SettledOutcomes | null { return this.props.outcomes ?? null; }
  get decidedAt(): Date | null { return this.props.decidedAt ?? null; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
