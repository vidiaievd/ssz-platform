import type { AiDraftCapability } from '../../../domain/entities/attempt-ai-draft.entity.js';

/** The labelled set a candidate model is measured on (plan 79, step 1.6). */
export class ListReviewCasesQuery {
  constructor(
    readonly capability: AiDraftCapability,
    readonly limit: number,
  ) {}
}
