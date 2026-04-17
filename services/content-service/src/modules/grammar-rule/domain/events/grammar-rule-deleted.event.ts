import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface GrammarRuleDeletedPayload {
  ruleId: string;
  ownerUserId: string;
}

export class GrammarRuleDeletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.grammar_rule.deleted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: GrammarRuleDeletedPayload;

  constructor(payload: GrammarRuleDeletedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.ruleId;
    this.payload = payload;
  }
}
