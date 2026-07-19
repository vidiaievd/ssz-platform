import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../exceptions/grammar-rule-domain.exceptions.js';

interface GrammarRuleQuickCheckProps {
  explanationId: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGrammarRuleQuickCheckProps {
  explanationId: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export class GrammarRuleQuickCheckEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: GrammarRuleQuickCheckProps,
  ) {
    super(id);
  }

  get explanationId(): string {
    return this.props.explanationId;
  }
  get question(): string {
    return this.props.question;
  }
  get options(): string[] {
    return this.props.options;
  }
  get correctOptionIndex(): number {
    return this.props.correctOptionIndex;
  }
  get explanation(): string {
    return this.props.explanation;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(
    p: CreateGrammarRuleQuickCheckProps,
    id?: string,
  ): Result<GrammarRuleQuickCheckEntity, GrammarRuleDomainError> {
    if (!p.question?.trim()) {
      return Result.fail(GrammarRuleDomainError.INVALID_QUICK_CHECK_DATA);
    }
    if (!p.options || p.options.length < 2) {
      return Result.fail(GrammarRuleDomainError.INVALID_QUICK_CHECK_DATA);
    }
    if (p.correctOptionIndex < 0 || p.correctOptionIndex >= p.options.length) {
      return Result.fail(GrammarRuleDomainError.INVALID_QUICK_CHECK_DATA);
    }
    if (!p.explanation?.trim()) {
      return Result.fail(GrammarRuleDomainError.INVALID_QUICK_CHECK_DATA);
    }

    const now = new Date();
    const entity = new GrammarRuleQuickCheckEntity(id ?? randomUUID(), {
      explanationId: p.explanationId,
      question: p.question,
      options: p.options,
      correctOptionIndex: p.correctOptionIndex,
      explanation: p.explanation,
      createdAt: now,
      updatedAt: now,
    });

    return Result.ok(entity);
  }

  static reconstitute(
    id: string,
    props: GrammarRuleQuickCheckProps,
  ): GrammarRuleQuickCheckEntity {
    return new GrammarRuleQuickCheckEntity(id, props);
  }
}
