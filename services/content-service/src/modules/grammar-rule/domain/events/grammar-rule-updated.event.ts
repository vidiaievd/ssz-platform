import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface GrammarRuleUpdatedPayload {
  ruleId: string;
  updatedFields: string[];
}

export class GrammarRuleUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.grammar_rule.updated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: GrammarRuleUpdatedPayload;

  constructor(payload: GrammarRuleUpdatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.ruleId;
    this.payload = payload;
  }
}
