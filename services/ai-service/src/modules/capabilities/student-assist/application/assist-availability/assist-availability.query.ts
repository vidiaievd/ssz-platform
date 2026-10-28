import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AiGateway } from '../../../../gateway/application/ai-gateway.js';
import type { AssistContext } from '../../domain/assist-answer.js';
import { STUDENT_ASSIST } from '../../student-assist.capability.js';
import { AssistPayerResolver, type AssistAccessError } from '../assist-payer.resolver.js';
import { assistRefusalOf, type AssistRefusal } from '../assist-refusal.js';

/** Whether the learner may ask the assistant in this context (plan 83, §3 `availability`). */
export class GetAssistAvailabilityQuery {
  constructor(
    readonly userId: string,
    readonly context: AssistContext,
  ) {}
}

export type AssistAvailability =
  | { kind: 'available' }
  /**
   * Not for this learner here. `reason` is the gate's or the switch's; null when it could not
   * be asked or the context could not be read — the client hides the assistant either way (R-f).
   */
  | { kind: 'unavailable'; reason: AssistRefusal | null }
  /** The context itself is refused, as a turn in it would be (422 / 404 / 403). */
  | { kind: 'rejected'; error: AssistAccessError };

/**
 * The first stage of a turn without the model (plan 83, step 5): the same payer a turn would
 * get from the same context, then the switch and the gate for that payer — the quota included,
 * so a spent allowance hides the button before a message is typed. No ledger row, no charge.
 * The turn itself checks again: this answer may be stale by the time the learner sends.
 */
@QueryHandler(GetAssistAvailabilityQuery)
export class GetAssistAvailabilityHandler implements IQueryHandler<GetAssistAvailabilityQuery, AssistAvailability> {
  private readonly logger = new Logger(GetAssistAvailabilityHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly access: AssistPayerResolver,
  ) {}

  async execute(query: GetAssistAvailabilityQuery): Promise<AssistAvailability> {
    let resolved;
    try {
      resolved = await this.access.resolve({ userId: query.userId, context: query.context });
    } catch (err) {
      this.logger.warn(`Assistant context of ${query.userId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return { kind: 'unavailable', reason: null };
    }
    if (resolved.isFail) return { kind: 'rejected', error: resolved.error };

    const admitted = await this.gateway.admits(STUDENT_ASSIST.code, resolved.value.payer);
    if (admitted.isOk) return { kind: 'available' };
    return { kind: 'unavailable', reason: assistRefusalOf(admitted.error) };
  }
}
