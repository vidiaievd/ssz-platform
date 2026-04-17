import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IGrammarRuleExplanationRepository,
  GRAMMAR_RULE_EXPLANATION_REPOSITORY,
} from '../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import { GrammarRuleExplanationEntity } from '../../domain/entities/grammar-rule-explanation.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { GrammarRuleExplanationMapper } from './mappers/grammar-rule-explanation.mapper.js';
import { domainDifficultyToPrisma } from './mappers/enum-converters.js';

export { GRAMMAR_RULE_EXPLANATION_REPOSITORY };

@Injectable()
export class PrismaGrammarRuleExplanationRepository implements IGrammarRuleExplanationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<GrammarRuleExplanationEntity | null> {
    const raw = await this.prisma.grammarRuleExplanation.findUnique({ where: { id } });
    return raw ? GrammarRuleExplanationMapper.toDomain(raw) : null;
  }

  async findByRuleId(
    ruleId: string,
    onlyPublished = false,
  ): Promise<GrammarRuleExplanationEntity[]> {
    const rows = await this.prisma.grammarRuleExplanation.findMany({
      where: {
        grammarRuleId: ruleId,
        deletedAt: null,
        ...(onlyPublished ? { status: 'PUBLISHED' } : {}),
      },
      orderBy: [{ minLevel: 'asc' }, { explanationLanguage: 'asc' }],
    });
    return rows.map((row) => GrammarRuleExplanationMapper.toDomain(row));
  }

  async findByCompositeKey(
    ruleId: string,
    explanationLanguage: string,
    minLevel: DifficultyLevel,
    maxLevel: DifficultyLevel,
  ): Promise<GrammarRuleExplanationEntity | null> {
    const raw = await this.prisma.grammarRuleExplanation.findUnique({
      where: {
        grammarRuleId_explanationLanguage_minLevel_maxLevel: {
          grammarRuleId: ruleId,
          explanationLanguage,
          minLevel: domainDifficultyToPrisma(minLevel),
          maxLevel: domainDifficultyToPrisma(maxLevel),
        },
      },
    });
    return raw ? GrammarRuleExplanationMapper.toDomain(raw) : null;
  }

  async save(entity: GrammarRuleExplanationEntity): Promise<GrammarRuleExplanationEntity> {
    const exists = await this.prisma.grammarRuleExplanation.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.grammarRuleExplanation.update({
          where: { id: entity.id },
          data: GrammarRuleExplanationMapper.toUpdateData(entity),
        })
      : await this.prisma.grammarRuleExplanation.create({
          data: GrammarRuleExplanationMapper.toCreateData(entity),
        });

    return GrammarRuleExplanationMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.grammarRuleExplanation.delete({ where: { id } });
  }

  async softDeleteByRuleId(ruleId: string): Promise<void> {
    const now = new Date();
    await this.prisma.grammarRuleExplanation.updateMany({
      where: { grammarRuleId: ruleId, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
  }
}
