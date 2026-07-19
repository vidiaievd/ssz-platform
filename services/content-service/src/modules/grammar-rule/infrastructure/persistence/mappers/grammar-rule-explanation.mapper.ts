import type { GrammarRuleExplanation } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVariantStatusToDomain,
  domainVariantStatusToPrisma,
} from './enum-converters.js';

export interface GrammarRuleExplanationCreateData {
  id: string;
  grammarRuleId: string;
  explanationLanguage: string;
  minLevel: $Enums.DifficultyLevel;
  maxLevel: $Enums.DifficultyLevel;
  displayTitle: string;
  displaySummary: string | null;
  bodyMarkdown: string;
  estimatedReadingMinutes: number | null;
  anchorText: string | null;
  anchorHighlights: string[];
  anchorNote: string | null;
  status: $Enums.VariantStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  lastEditedByUserId: string;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

export type GrammarRuleExplanationUpdateData = Partial<
  Omit<
    GrammarRuleExplanationCreateData,
    | 'id'
    | 'grammarRuleId'
    | 'explanationLanguage'
    | 'minLevel'
    | 'maxLevel'
    | 'createdAt'
    | 'createdByUserId'
  >
>;

export class GrammarRuleExplanationMapper {
  static toDomain(raw: GrammarRuleExplanation): GrammarRuleExplanationEntity {
    return GrammarRuleExplanationEntity.reconstitute(raw.id, {
      grammarRuleId: raw.grammarRuleId,
      explanationLanguage: raw.explanationLanguage,
      minLevel: prismaDifficultyToDomain(raw.minLevel),
      maxLevel: prismaDifficultyToDomain(raw.maxLevel),
      displayTitle: raw.displayTitle,
      displaySummary: raw.displaySummary,
      bodyMarkdown: raw.bodyMarkdown,
      estimatedReadingMinutes: raw.estimatedReadingMinutes,
      anchorText: raw.anchorText,
      anchorHighlights: raw.anchorHighlights,
      anchorNote: raw.anchorNote,
      status: prismaVariantStatusToDomain(raw.status),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      createdByUserId: raw.createdByUserId,
      lastEditedByUserId: raw.lastEditedByUserId,
      publishedAt: raw.publishedAt,
      deletedAt: raw.deletedAt,
    });
  }

  static toCreateData(entity: GrammarRuleExplanationEntity): GrammarRuleExplanationCreateData {
    return {
      id: entity.id,
      grammarRuleId: entity.grammarRuleId,
      explanationLanguage: entity.explanationLanguage,
      minLevel: domainDifficultyToPrisma(entity.minLevel),
      maxLevel: domainDifficultyToPrisma(entity.maxLevel),
      displayTitle: entity.displayTitle,
      displaySummary: entity.displaySummary,
      bodyMarkdown: entity.bodyMarkdown,
      estimatedReadingMinutes: entity.estimatedReadingMinutes,
      anchorText: entity.anchorText,
      anchorHighlights: entity.anchorHighlights,
      anchorNote: entity.anchorNote,
      status: domainVariantStatusToPrisma(entity.status),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      createdByUserId: entity.createdByUserId,
      lastEditedByUserId: entity.lastEditedByUserId,
      publishedAt: entity.publishedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: GrammarRuleExplanationEntity): GrammarRuleExplanationUpdateData {
    return {
      displayTitle: entity.displayTitle,
      displaySummary: entity.displaySummary,
      bodyMarkdown: entity.bodyMarkdown,
      estimatedReadingMinutes: entity.estimatedReadingMinutes,
      anchorText: entity.anchorText,
      anchorHighlights: entity.anchorHighlights,
      anchorNote: entity.anchorNote,
      status: domainVariantStatusToPrisma(entity.status),
      updatedAt: entity.updatedAt,
      lastEditedByUserId: entity.lastEditedByUserId,
      publishedAt: entity.publishedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
