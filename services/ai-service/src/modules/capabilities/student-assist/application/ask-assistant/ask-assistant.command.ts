import type { AssistContext } from '../../domain/assist-answer.js';

/**
 * One learner turn of the assistant (plan 83, §3): what the phone sent — the thread lives
 * there (Q1 = A) — and who asks, from the JWT. Shapes and sizes are the controller's to check.
 */
export class AskAssistantCommand {
  constructor(
    readonly userId: string,
    readonly context: AssistContext,
    readonly history: readonly { role: 'user' | 'assistant'; text: string }[],
    readonly message: string,
  ) {}
}
