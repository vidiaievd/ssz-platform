import type { GrammarRuleQuickCheck } from '../../../../../../generated/prisma/client.js';
import { GrammarRuleQuickCheckEntity } from '../../../domain/entities/grammar-rule-quick-check.entity.js';

// Shape passed to prisma.grammarRuleQuickCheck.upsert({ create/update: ... })
export interface GrammarRuleQuickCheckData {
  id: string;
  explanationId: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GrammarRuleQuickCheckMapper {
  static toDomain(raw: GrammarRuleQuickCheck): GrammarRuleQuickCheckEntity {
    return GrammarRuleQuickCheckEntity.reconstitute(raw.id, {
      explanationId: raw.explanationId,
      question: raw.question,
      options: raw.options,
      correctOptionIndex: raw.correctOptionIndex,
      explanation: raw.explanation,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  static toData(entity: GrammarRuleQuickCheckEntity): GrammarRuleQuickCheckData {
    return {
      id: entity.id,
      explanationId: entity.explanationId,
      question: entity.question,
      options: entity.options,
      correctOptionIndex: entity.correctOptionIndex,
      explanation: entity.explanation,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
