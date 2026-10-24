import type { AiVerdict } from '../../../domain/ai-verdict.js';
import type { ProposedDraft } from '../../../domain/entities/attempt-ai-draft.entity.js';

export class PutAiReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly draft: ProposedDraft,
    /** Null for a `FAILED` draft — no review, so nothing to rule. */
    readonly verdict: AiVerdict | null,
  ) {}
}
