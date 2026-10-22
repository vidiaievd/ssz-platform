import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AiDraftRemark } from '../../../domain/entities/attempt-ai-draft.entity.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { GetDraftForReviewQuery } from './get-draft-for-review.query.js';

/** `ready` until the verdict settles it; the other three are set by step 1.5. */
export type ReviewDraftStatus = 'ready' | 'sent' | 'edited' | 'discarded';

/** What the review card is drawn from — the remarks, and which model and prompt wrote them. */
export interface ReviewDraftView {
  status: ReviewDraftStatus;
  items: AiDraftRemark[];
  summary: string | null;
  modelId: string | null;
  promptVersion: string | null;
  createdAt: Date;
}

/**
 * The model's draft on one submission, as the reviewer reads it — or null.
 *
 * A `failed` draft reads as none: it has no text, and the card it would be drawn on is
 * the same card a submission without a draft gets. Who may read the submission at all is
 * the caller's business (the review query has already answered it); this only says what
 * the model left there.
 */
@QueryHandler(GetDraftForReviewQuery)
export class GetDraftForReviewHandler implements IQueryHandler<GetDraftForReviewQuery> {
  constructor(
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
  ) {}

  async execute(query: GetDraftForReviewQuery): Promise<ReviewDraftView | null> {
    const draft = await this.drafts.findByAttempt(query.attemptId, query.capability);
    if (draft === null || draft.status === 'FAILED') return null;

    return {
      status: draft.status.toLowerCase() as ReviewDraftStatus,
      items: draft.items,
      summary: draft.summary,
      modelId: draft.modelId,
      promptVersion: draft.promptVersion,
      createdAt: draft.createdAt,
    };
  }
}
