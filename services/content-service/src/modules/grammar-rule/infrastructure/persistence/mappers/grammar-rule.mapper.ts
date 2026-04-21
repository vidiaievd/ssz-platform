import type { GrammarRule } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
  prismaGrammarTopicToDomain,
  domainGrammarTopicToPrisma,
} from './enum-converters.js';

export interface GrammarRuleCreateData {
  id: string;
  slug: string | null;
  targetLanguage: string;
  difficultyLevel: $Enums.DifficultyLevel;
  topic: $Enums.GrammarTopic;
  subtopic: string | null;
  title: string;
  description: string | null;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: $Enums.Visibility;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type GrammarRuleUpdateData = Partial<
  Omit<
    GrammarRuleCreateData,
    'id' | 'targetLanguage' | 'ownerUserId' | 'ownerSchoolId' | 'createdAt'
  >
>;

export class GrammarRuleMapper {
  static toDomain(raw: GrammarRule): GrammarRuleEntity {
    return GrammarRuleEntity.reconstitute(raw.id, {
      slug: raw.slug,
      targetLanguage: raw.targetLanguage,
      difficultyLevel: prismaDifficultyToDomain(raw.difficultyLevel),
      topic: prismaGrammarTopicToDomain(raw.topic),
      subtopic: raw.subtopic,
      title: raw.title,
      description: raw.description,
      ownerUserId: raw.ownerUserId,
      ownerSchoolId: raw.ownerSchoolId,
      visibility: prismaVisibilityToDomain(raw.visibility),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
    });
  }

  static toCreateData(entity: GrammarRuleEntity): GrammarRuleCreateData {
    return {
      id: entity.id,
      slug: entity.slug,
      targetLanguage: entity.targetLanguage,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      topic: domainGrammarTopicToPrisma(entity.topic),
      subtopic: entity.subtopic,
      title: entity.title,
      description: entity.description,
      ownerUserId: entity.ownerUserId,
      ownerSchoolId: entity.ownerSchoolId,
      visibility: domainVisibilityToPrisma(entity.visibility),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: GrammarRuleEntity): GrammarRuleUpdateData {
    return {
      slug: entity.slug,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      topic: domainGrammarTopicToPrisma(entity.topic),
      subtopic: entity.subtopic,
      title: entity.title,
      description: entity.description,
      visibility: domainVisibilityToPrisma(entity.visibility),
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
