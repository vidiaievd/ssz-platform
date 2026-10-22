import type { AiDraftCapability, ProposedDraft } from '../../../domain/entities/attempt-ai-draft.entity.js';

export class PutAiDraftCommand {
  constructor(
    readonly attemptId: string,
    readonly capability: AiDraftCapability,
    readonly draft: ProposedDraft,
  ) {}
}
