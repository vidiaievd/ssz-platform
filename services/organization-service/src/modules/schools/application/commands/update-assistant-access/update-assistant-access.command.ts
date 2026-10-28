import type { AssistantMode } from '../../../domain/value-objects/assistant-access.vo.js';

/** Which students the school's assistant answers, set whole: the mode with both lists. */
export class UpdateAssistantAccessCommand {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
    public readonly mode: AssistantMode,
    public readonly groupIds: string[],
    public readonly studentIds: string[],
  ) {}
}
