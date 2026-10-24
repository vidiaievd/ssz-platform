import type { AiDraftCapability } from '../../../domain/entities/attempt-ai-draft.entity.js';
import type { ReviewerOutcomes } from '../../../domain/draft-outcomes.js';
import type { RubricMarks } from '@ssz/shared-kernel/writing-task';

/** A verdict landed on an attempt with a draft the reviewer was shown (plan 79, 1.5). */
export class SettleAiDraftCommand {
  constructor(
    readonly attemptId: string,
    readonly capability: AiDraftCapability,
    readonly outcomes: ReviewerOutcomes,
    /** The marks the verdict stored — what suggested marks are compared with (1.7c). */
    readonly rubricMarks: RubricMarks | null = null,
  ) {}
}
