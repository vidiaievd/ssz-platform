import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface GrammarRuleCreatedPayload {
  ruleId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  targetLanguage: string;
  topic: string;
  visibility: string;
}

export class GrammarRuleCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.grammar_rule.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: GrammarRuleCreatedPayload;

  constructor(payload: GrammarRuleCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.ruleId;
    this.payload = payload;
  }
}
