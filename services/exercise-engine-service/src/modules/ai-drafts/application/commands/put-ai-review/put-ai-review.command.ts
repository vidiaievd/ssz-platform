import type { AiVerdict } from '../../../domain/ai-verdict.js';
import type { ProposedDraft } from '../../../domain/entities/attempt-ai-draft.entity.js';
import type { PromptHearing } from '../../../domain/reading-verdict.js';

export class PutAiReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly draft: ProposedDraft,
    /** Null for a `FAILED` draft — no review, so nothing to rule — and for a reading. */
    readonly verdict: AiVerdict | null,
    /**
     * A `read_aloud` reading (plan 82, step 7): what was heard in each prompt. The engine
     * rules from it; null for a `FAILED` draft and for every other template.
     */
    readonly reading: PromptHearing[] | null = null,
  ) {}
}
