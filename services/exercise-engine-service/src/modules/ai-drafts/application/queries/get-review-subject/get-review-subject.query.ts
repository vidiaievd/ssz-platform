import type { AiDraftCapability } from '../../../domain/entities/attempt-ai-draft.entity.js';

export class GetReviewSubjectQuery {
  constructor(
    readonly attemptId: string,
    readonly capability: AiDraftCapability,
  ) {}
}
