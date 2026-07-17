import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../exceptions/grammar-rule-domain.exceptions.js';

interface GrammarRuleCompareExampleProps {
  explanationId: string;
  position: number;
  sentence: string;
  note: string | null;
  isCorrect: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGrammarRuleCompareExampleProps {
  explanationId: string;
  position: number;
  sentence: string;
  note?: string;
  isCorrect: boolean;
}

export class GrammarRuleCompareExampleEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: GrammarRuleCompareExampleProps,
  ) {
    super(id);
  }

  get explanationId(): string {
    return this.props.explanationId;
  }
  get position(): number {
    return this.props.position;
  }
  get sentence(): string {
    return this.props.sentence;
  }
  get note(): string | null {
    return this.props.note;
  }
  get isCorrect(): boolean {
    return this.props.isCorrect;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(
    p: CreateGrammarRuleCompareExampleProps,
    id?: string,
  ): Result<GrammarRuleCompareExampleEntity, GrammarRuleDomainError> {
    if (!p.sentence?.trim()) {
      return Result.fail(GrammarRuleDomainError.INVALID_COMPARE_EXAMPLE_DATA);
    }
    if (p.position < 0) {
      return Result.fail(GrammarRuleDomainError.INVALID_COMPARE_EXAMPLE_DATA);
    }

    const now = new Date();
    const entity = new GrammarRuleCompareExampleEntity(id ?? randomUUID(), {
      explanationId: p.explanationId,
      position: p.position,
      sentence: p.sentence,
      note: p.note ?? null,
      isCorrect: p.isCorrect,
      createdAt: now,
      updatedAt: now,
    });

    return Result.ok(entity);
  }

  static reconstitute(
    id: string,
    props: GrammarRuleCompareExampleProps,
  ): GrammarRuleCompareExampleEntity {
    return new GrammarRuleCompareExampleEntity(id, props);
  }
}
