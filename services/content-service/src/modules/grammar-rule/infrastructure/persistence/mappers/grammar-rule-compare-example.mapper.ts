import type { GrammarRuleCompareExample } from '../../../../../../generated/prisma/client.js';
import { GrammarRuleCompareExampleEntity } from '../../../domain/entities/grammar-rule-compare-example.entity.js';

// Shape passed to prisma.grammarRuleCompareExample.create({ data: ... })
export interface GrammarRuleCompareExampleCreateData {
  id: string;
  explanationId: string;
  position: number;
  sentence: string;
  note: string | null;
  isCorrect: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class GrammarRuleCompareExampleMapper {
  static toDomain(raw: GrammarRuleCompareExample): GrammarRuleCompareExampleEntity {
    return GrammarRuleCompareExampleEntity.reconstitute(raw.id, {
      explanationId: raw.explanationId,
      position: raw.position,
      sentence: raw.sentence,
      note: raw.note,
      isCorrect: raw.isCorrect,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  static toCreateData(entity: GrammarRuleCompareExampleEntity): GrammarRuleCompareExampleCreateData {
    return {
      id: entity.id,
      explanationId: entity.explanationId,
      position: entity.position,
      sentence: entity.sentence,
      note: entity.note,
      isCorrect: entity.isCorrect,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toCreateManyData(
    entities: GrammarRuleCompareExampleEntity[],
  ): GrammarRuleCompareExampleCreateData[] {
    return entities.map((entity) => GrammarRuleCompareExampleMapper.toCreateData(entity));
  }
}
