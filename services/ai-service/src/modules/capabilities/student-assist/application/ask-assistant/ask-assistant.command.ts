import type { AssistContext } from '../../domain/assist-answer.js';
import type { AssistStream } from '../assist-loop.js';

/**
 * One learner turn of the assistant (plan 83, §3): what the phone sent — the thread lives
 * there (Q1 = A) — and who asks, from the JWT. Shapes and sizes are the controller's to check.
 * `stream` — the client of a streamed turn (step 9), told the answer's text as it is written.
 */
export class AskAssistantCommand {
  constructor(
    readonly userId: string,
    readonly context: AssistContext,
    readonly history: readonly { role: 'user' | 'assistant'; text: string }[],
    readonly message: string,
    readonly stream?: AssistStream,
  ) {}
}
