import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../exceptions/grammar-rule-domain.exceptions.js';

interface GrammarRuleExercisePoolEntryProps {
  grammarRuleId: string;
  exerciseId: string;
  position: number;
  weight: number;
  addedAt: Date;
  addedByUserId: string;
}

export interface CreatePoolEntryProps {
  grammarRuleId: string;
  exerciseId: string;
  position: number;
  weight?: number;
  addedByUserId: string;
}

export class GrammarRuleExercisePoolEntry extends Entity<string> {
  private constructor(
    id: string,
    private props: GrammarRuleExercisePoolEntryProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get grammarRuleId(): string {
    return this.props.grammarRuleId;
  }
  get exerciseId(): string {
    return this.props.exerciseId;
  }
  get position(): number {
    return this.props.position;
  }
  get weight(): number {
    return this.props.weight;
  }
  get addedAt(): Date {
    return this.props.addedAt;
  }
  get addedByUserId(): string {
    return this.props.addedByUserId;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreatePoolEntryProps,
    id?: string,
  ): Result<GrammarRuleExercisePoolEntry, GrammarRuleDomainError> {
    const weight = p.weight ?? 1.0;
    if (weight <= 0) {
      return Result.fail(GrammarRuleDomainError.INVALID_WEIGHT);
    }

    return Result.ok(
      new GrammarRuleExercisePoolEntry(id ?? randomUUID(), {
        grammarRuleId: p.grammarRuleId,
        exerciseId: p.exerciseId,
        position: p.position,
        weight,
        addedAt: new Date(),
        addedByUserId: p.addedByUserId,
      }),
    );
  }

  static reconstitute(
    id: string,
    props: GrammarRuleExercisePoolEntryProps,
  ): GrammarRuleExercisePoolEntry {
    return new GrammarRuleExercisePoolEntry(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  updateWeight(newWeight: number): Result<void, GrammarRuleDomainError> {
    if (newWeight <= 0) {
      return Result.fail(GrammarRuleDomainError.INVALID_WEIGHT);
    }
    this.props.weight = newWeight;
    return Result.ok();
  }

  updatePosition(newPosition: number): void {
    this.props.position = newPosition;
  }
}
