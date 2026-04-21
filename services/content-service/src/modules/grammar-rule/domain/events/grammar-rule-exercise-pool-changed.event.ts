import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface GrammarRuleExercisePoolChangedPayload {
  ruleId: string;
  action: 'added' | 'removed' | 'reordered';
  exerciseId?: string;
}

export class GrammarRuleExercisePoolChangedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.grammar_rule.exercise_pool.changed';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: GrammarRuleExercisePoolChangedPayload;

  constructor(payload: GrammarRuleExercisePoolChangedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.ruleId;
    this.payload = payload;
  }
}
